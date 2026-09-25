"""Yagona yuklash nuqtasi: diskka yozish, sha256, dublikatni aniqlash.

Ilgari yuklash toʻrt joyda mustaqil bajarilardi va hech biri bazaga yozuv
qoldirmasdi. Endi hammasi shu yerdan oʻtadi, natijada har bir fayl kutubxonada
koʻrinadi va uni qayta yuklamasdan boshqa kursga qoʻshish mumkin.
"""

import hashlib
import logging
import os
import re
import shutil
import uuid
from collections.abc import Iterable
from pathlib import Path

from core.config import settings
from core.utils.image_upload import looks_like_image
from fastapi import HTTPException, UploadFile, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.file import quota
from app.modules.file.model import FileBlob, FileUsage, StoredFile

logger = logging.getLogger(__name__)

# Cheklovlar ilgari modules/course/resource/repository.py da edi. Bu yerga
# koʻchirildi, chunki endi yuklashning yagona yoʻli shu.
IMAGE_EXTS = {"jpg", "jpeg", "png", "gif", "webp"}
DOCUMENT_EXTS = {"pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "zip"}
ALLOWED_EXTS = IMAGE_EXTS | DOCUMENT_EXTS

IMAGE_MAX_BYTES = 5 * 1024 * 1024
DOCUMENT_MAX_BYTES = 20 * 1024 * 1024

CHUNK_SIZE = 1024 * 1024


def _extension(filename: str | None) -> str:
    if not filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Fayl nomi boʻsh")
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Bu turdagi fayl qabul qilinmaydi: .{ext}",
        )
    return ext


def public_url(stored_path: str) -> str:
    """Bazada saqlanadigan havola. Nisbiy — domen almashsa ham ishlayveradi."""
    return f"{settings.file_url.http}/{stored_path}"


async def _stream_to_temp(file: UploadFile, ext: str) -> tuple[Path, str, int]:
    """Faylni vaqtinchalik nomga yozadi, sha256 va hajmini qaytaradi.

    Hajm yozish DAVOMIDA tekshiriladi, oldindan emas: ``Content-Length`` ni
    mijoz yozadi va unga ishonib boʻlmaydi.
    """
    max_size = IMAGE_MAX_BYTES if ext in IMAGE_EXTS else DOCUMENT_MAX_BYTES

    tmp_dir = settings.upload_tmp_dir
    os.makedirs(tmp_dir, exist_ok=True)
    tmp_path = tmp_dir / f"{uuid.uuid4()}.{ext}.part"

    digest = hashlib.sha256()
    size = 0
    first_chunk = True
    try:
        with open(tmp_path, "wb") as buffer:
            while chunk := await file.read(CHUNK_SIZE):
                if first_chunk:
                    first_chunk = False
                    # Kengaytma — mijoz tanlagan nom, unga ishonib boʻlmaydi:
                    # istalgan faylni .png deb atash mumkin, u esa bizning
                    # domenimizdan beriladi. Shuning uchun rasmlar uchun
                    # birinchi baytlardagi imzo ham tekshiriladi.
                    if ext in IMAGE_EXTS and not looks_like_image(chunk, ext):
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Fayl mazmuni kengaytmasiga mos kelmaydi — bu rasm emas",
                        )
                size += len(chunk)
                if size > max_size:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Fayl hajmi {max_size // (1024 * 1024)}MB dan oshmasligi kerak",
                    )
                digest.update(chunk)
                buffer.write(chunk)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise

    if size == 0:
        tmp_path.unlink(missing_ok=True)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Fayl boʻsh")

    return tmp_path, digest.hexdigest(), size


async def _get_or_create_blob(
    session: AsyncSession,
    *,
    sha256: str,
    tmp_path: Path,
    ext: str,
    size: int,
    mime_type: str | None,
    subdir: str,
) -> FileBlob:
    """Shunday baytlar allaqachon bormi — shuni hal qiladi."""
    existing = await session.scalar(select(FileBlob).where(FileBlob.sha256 == sha256))
    if existing:
        # Nusxa kerak emas: vaqtinchalik faylni tashlaymiz.
        tmp_path.unlink(missing_ok=True)
        return existing

    target_dir = settings.absolute_upload_dir / subdir
    os.makedirs(target_dir, exist_ok=True)
    stored_name = f"{uuid.uuid4()}.{ext}"
    target_path = target_dir / stored_name

    # Bir bo'lim ichida bu atomik rename; boʻlimlar har xil boʻlsa shutil
    # nusxalab, keyin oʻchiradi.
    shutil.move(str(tmp_path), str(target_path))

    blob = FileBlob(
        sha256=sha256,
        stored_path=f"{subdir}/{stored_name}",
        size_bytes=size,
        mime_type=mime_type,
    )
    session.add(blob)
    try:
        await session.flush()
    except IntegrityError:
        # Ikki soʻrov bir vaqtda bir xil faylni yukladi va ikkalasi ham "yoʻq"
        # degan xulosaga keldi. sha256 dagi unique indeks ikkinchisini
        # toʻxtatadi — mavjudini oʻqiymiz, ortiqcha nusxani oʻchiramiz.
        await session.rollback()
        target_path.unlink(missing_ok=True)
        blob = await session.scalar(select(FileBlob).where(FileBlob.sha256 == sha256))
        if blob is None:  # pragma: no cover — IntegrityError boshqa sababdan
            raise
        logger.info("Bir vaqtda yuklash aniqlandi, mavjud blob ishlatildi: %s", sha256[:12])

    return blob


async def _check_quota(
    session: AsyncSession, owner_user_id: int, *, sha256: str, size: int
) -> StoredFile | None:
    """Yuklash limitini tekshiradi. Faylning oʻzi shu foydalanuvchida bor
    boʻlsa, oʻsha yozuvni qaytaradi — u limitdan qayta ayirilmaydi.

    Tartib muhim. Avval qulf: parallel yuklashlar navbat bilan hisoblanadi.
    Keyin dublikat: oʻzida bor faylni qayta yuklash joy egallamaydi va limit
    toʻla boʻlsa ham rad etilmasligi kerak. Oxirida limit — blob hali
    yaratilmagan, shuning uchun rad etilgan fayl diskda iz qoldirmaydi.

    Hajm oqim tugagach, aniq bayt soni bilan tekshiriladi. Fayl bittasi
    20 MB dan oshmaydi, shuning uchun uni oxirigacha qabul qilish arzon, aniq
    hajm esa dublikatni toʻgʻri ajratishga imkon beradi.
    """
    limit, _ = await quota.effective_limit(session, owner_user_id)
    if limit is not None:
        await quota.lock(session, owner_user_id)

    duplicate = await session.scalar(
        select(StoredFile)
        .join(FileBlob, FileBlob.id == StoredFile.blob_id)
        .where(
            StoredFile.owner_user_id == owner_user_id,
            FileBlob.sha256 == sha256,
            StoredFile.is_active.is_(True),
        )
        .limit(1)
    )
    if duplicate is not None or limit is None:
        return duplicate

    used, _ = await quota.usage(session, owner_user_id)
    if used + size > limit:
        logger.info(
            "Yuklash limiti: user=%s used=%s size=%s limit=%s", owner_user_id, used, size, limit
        )
        raise quota.exceeded_error(limit, used, size)
    return None


async def store_upload(
    session: AsyncSession,
    file: UploadFile,
    *,
    owner_user_id: int | None,
    subdir: str = "files",
    folder_id: int | None = None,
    title: str | None = None,
) -> tuple[StoredFile, bool]:
    """Faylni saqlaydi va ``(kutubxona_yozuvi, yangi_yaratildimi)`` qaytaradi.

    ``subdir`` — eski yuklash yoʻllari uchun: savol rasmlari ``question/`` da,
    kurs materiallari ``course_resources/`` da qolishi kerak, aks holda
    bazadagi mavjud havolalar buziladi.

    Ikkinchi qiymat kerak, chunki dublikat qaytganda javob yangi yozuvnikidan
    farq qilmaydi: ikkalasi ham bir xil ``StoredFile``. Buni faqat shu yer
    biladi, shuning uchun chaqiruvchiga aynan shu yerdan aytiladi — mijoz uni
    roʻyxat uzunligiga qarab taxmin qila olmaydi (roʻyxat filtrlangan va
    sahifalangan).

    Egasi koʻrsatilgan boʻlsa, yuklash limiti shu yerda tekshiriladi
    (``_check_quota``) — toʻrtala yuklash yoʻli ham shu funksiyadan oʻtadi.
    """
    ext = _extension(file.filename)
    tmp_path, sha256, size = await _stream_to_temp(file, ext)

    if owner_user_id is not None:
        try:
            duplicate = await _check_quota(session, owner_user_id, sha256=sha256, size=size)
        except BaseException:
            tmp_path.unlink(missing_ok=True)
            raise
        if duplicate is not None:
            tmp_path.unlink(missing_ok=True)
            return duplicate, False

    blob = await _get_or_create_blob(
        session,
        sha256=sha256,
        tmp_path=tmp_path,
        ext=ext,
        size=size,
        mime_type=file.content_type,
        subdir=subdir,
    )

    stored = StoredFile(
        blob_id=blob.id,
        owner_user_id=owner_user_id,
        folder_id=folder_id,
        title=title or (file.filename or "fayl"),
        original_name=file.filename or "fayl",
    )
    session.add(stored)
    await session.flush()
    return stored, True


# Havoladan uploads ichidagi nisbiy yoʻlni ajratib olish — import skriptidagi
# bilan bir xil qoida: havola absolut ham, nisbiy ham boʻlishi mumkin.
_UPLOAD_PATH_RE = re.compile(r"/uploads/([A-Za-z0-9_\-./]+\.[A-Za-z0-9]{1,8})")


def stored_path_from_url(url: str | None) -> str | None:
    """``public_url`` ning teskarisi: havoladan ``FileBlob.stored_path``."""
    if not url:
        return None
    prefix = settings.file_url.http.rstrip("/") + "/"
    if url.startswith(prefix):
        return url[len(prefix):]
    match = _UPLOAD_PATH_RE.search(url)
    return match.group(1) if match else None


async def sync_usages(
    session: AsyncSession,
    *,
    entity_type: str,
    entity_id: int,
    urls: Iterable[str | None],
    owner_user_id: int | None = None,
) -> None:
    """Obyektning ``file_usages`` yozuvlarini uning hozirgi havolalariga moslaydi.

    Kurs kutubxonasi va xavfsiz oʻchirish shu jadvalga tayanadi. Ilgari uni
    faqat bir martalik import skripti toʻldirardi — natijada keyin darsga
    biriktirilgan fayl kutubxonada koʻrinmasdi. Commit qilmaydi: chaqiruvchi
    oʻz oʻzgarishi bilan birga saqlaydi.

    Bitta blobga bir nechta yozuv ishora qilishi mumkin; biriktirgan
    foydalanuvchiniki afzal, boʻlmasa eng eskisi.
    """
    paths = {p for url in urls if (p := stored_path_from_url(url))}

    wanted: set[int] = set()
    for path in paths:
        file_id = await session.scalar(
            select(StoredFile.id)
            .join(StoredFile.blob)
            .where(FileBlob.stored_path == path, StoredFile.is_active.is_(True))
            .order_by((StoredFile.owner_user_id == owner_user_id).desc(), StoredFile.id)
            .limit(1)
        )
        if file_id is not None:
            wanted.add(file_id)

    existing = set(
        (
            await session.scalars(
                select(FileUsage.file_id).where(
                    FileUsage.entity_type == entity_type, FileUsage.entity_id == entity_id
                )
            )
        ).all()
    )

    stale = existing - wanted
    if stale:
        await session.execute(
            delete(FileUsage).where(
                FileUsage.entity_type == entity_type,
                FileUsage.entity_id == entity_id,
                FileUsage.file_id.in_(stale),
            )
        )
    for file_id in wanted - existing:
        session.add(FileUsage(file_id=file_id, entity_type=entity_type, entity_id=entity_id))
