"""Yagona yuklash nuqtasi: diskka yozish, sha256, dublikatni aniqlash.

Ilgari yuklash toʻrt joyda mustaqil bajarilardi va hech biri bazaga yozuv
qoldirmasdi. Endi hammasi shu yerdan oʻtadi, natijada har bir fayl kutubxonada
koʻrinadi va uni qayta yuklamasdan boshqa kursga qoʻshish mumkin.
"""

import hashlib
import logging
import os
import shutil
import uuid
from pathlib import Path

from core.config import settings
from core.utils.image_upload import looks_like_image
from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.file.model import FileBlob, StoredFile

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


async def store_upload(
    session: AsyncSession,
    file: UploadFile,
    *,
    owner_user_id: int | None,
    subdir: str = "files",
    folder_id: int | None = None,
    title: str | None = None,
) -> StoredFile:
    """Faylni saqlaydi va kutubxona yozuvini qaytaradi.

    ``subdir`` — eski yuklash yoʻllari uchun: savol rasmlari ``question/`` da,
    kurs materiallari ``course_resources/`` da qolishi kerak, aks holda
    bazadagi mavjud havolalar buziladi.
    """
    ext = _extension(file.filename)
    tmp_path, sha256, size = await _stream_to_temp(file, ext)

    blob = await _get_or_create_blob(
        session,
        sha256=sha256,
        tmp_path=tmp_path,
        ext=ext,
        size=size,
        mime_type=file.content_type,
        subdir=subdir,
    )

    # Ayni foydalanuvchi shu faylni allaqachon yuklagan boʻlsa, kutubxonasini
    # bir xil yozuvlar bilan toʻldirmaymiz.
    if owner_user_id is not None:
        duplicate = await session.scalar(
            select(StoredFile).where(
                StoredFile.owner_user_id == owner_user_id,
                StoredFile.blob_id == blob.id,
                StoredFile.is_active.is_(True),
            )
        )
        if duplicate:
            return duplicate

    stored = StoredFile(
        blob_id=blob.id,
        owner_user_id=owner_user_id,
        folder_id=folder_id,
        title=title or (file.filename or "fayl"),
        original_name=file.filename or "fayl",
    )
    session.add(stored)
    await session.flush()
    return stored
