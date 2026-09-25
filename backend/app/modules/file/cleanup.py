"""Oʻchirilgan fayllarning baytlarini diskdan tozalash.

Kutubxonadan oʻchirish faqat ``is_active=False`` qiladi, baytlar esa diskda
qoladi. Yuklash limiti oʻchirilgan faylni hisobdan chiqaradi — demak busiz
«yukla, oʻchir, yana yukla» sikli limitni buzmasdan diskni cheksiz toʻldiradi.

Blob faqat quyidagilarning HAMMASI bajarilsa oʻchiriladi:

1. unga ishora qiluvchi faol ``StoredFile`` yoʻq;
2. uning yozuvlaridan hech biri ``file_usages`` da yoʻq;
3. oxirgi yozuvi ``grace_days`` kundan oldin oʻchirilgan (blob ham shundan
   eski) — xato oʻchirilgan faylni shu muddat ichida tiklash mumkin;
4. fayl nomi bazaning HECH BIR matn ustunida uchramaydi.

Toʻrtinchi shart eng muhimi. ``file_usages`` havolalarning hammasini
bilmaydi: savol HTML'idagi ``<img src>``, eʼlon rasmi, eski ``file_url``
lar u yerda boʻlmasligi mumkin (``scripts/import_files.py`` dagi
ogohlantirishni qarang). Shuning uchun ustunlar roʻyxati qoʻlda yozilmaydi —
``information_schema`` dan olinadi, keyin qoʻshilgan jadvallar ham oʻz-oʻzidan
tekshiriladi. Nom ``uuid4`` dan yasalgan, tasodifiy mos kelish imkonsiz.

Diskdagi blob'ga aloqasi yoʻq fayllarga (import qilinmagan nusxalar)
umuman tegilmaydi.
"""

import logging
import re
from dataclasses import dataclass
from datetime import timedelta
from pathlib import PurePosixPath

from core.config import settings
from sqlalchemy import delete, exists, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.mixins.time_stamp_mixin import utcnow_naive
from app.modules.file.model import FileBlob, FileUsage, StoredFile

logger = logging.getLogger(__name__)

# Bu jadvallardagi nomlar blob'ning oʻziniki — ularni «havola» deb sanash
# har bir blob'ni abadiy saqlab qolardi.
_SELF_TABLES = {"file_blobs", "files", "file_folders", "file_usages", "alembic_version"}

_TEXT_TYPES = ("text", "character varying", "json", "jsonb")

# Regex juda uzun boʻlib ketmasligi uchun nomlar boʻlaklab tekshiriladi.
_CHUNK = 200


@dataclass
class Candidate:
    blob_id: int
    stored_path: str
    size_bytes: int

    @property
    def name(self) -> str:
        return PurePosixPath(self.stored_path).name


async def find_candidates(session: AsyncSession, grace_days: int) -> list[Candidate]:
    """1–3-shartlarga mos blob'lar. 4-shart ``drop_referenced`` da."""
    cutoff = utcnow_naive() - timedelta(days=grace_days)

    active_file = exists().where(StoredFile.blob_id == FileBlob.id, StoredFile.is_active.is_(True))
    used = exists().where(StoredFile.blob_id == FileBlob.id, FileUsage.file_id == StoredFile.id)
    recently_touched = exists().where(StoredFile.blob_id == FileBlob.id, StoredFile.updated_at >= cutoff)

    rows = (
        await session.execute(
            select(FileBlob.id, FileBlob.stored_path, FileBlob.size_bytes)
            .where(~active_file, ~used, ~recently_touched, FileBlob.created_at < cutoff)
            .order_by(FileBlob.id)
        )
    ).all()
    return [Candidate(blob_id=r[0], stored_path=r[1], size_bytes=r[2]) for r in rows]


async def _text_columns(session: AsyncSession) -> list[tuple[str, str]]:
    rows = (
        await session.execute(
            text(
                "SELECT table_name, column_name FROM information_schema.columns "
                "WHERE table_schema = current_schema() AND data_type = ANY(:types)"
            ),
            {"types": list(_TEXT_TYPES)},
        )
    ).all()
    return [(t, c) for t, c in rows if t not in _SELF_TABLES]


async def drop_referenced(session: AsyncSession, candidates: list[Candidate]) -> list[Candidate]:
    """Nomi bazada biror joyda uchraydigan blob'larni roʻyxatdan chiqaradi."""
    if not candidates:
        return []

    referenced: set[str] = set()
    columns = await _text_columns(session)
    names = [c.name for c in candidates]

    for start in range(0, len(names), _CHUNK):
        chunk = names[start : start + _CHUNK]
        pattern = "|".join(re.escape(n) for n in chunk)
        compiled = re.compile(pattern)
        for table, column in columns:
            # Jadval va ustun nomi information_schema'dan — foydalanuvchidan emas.
            rows = await session.execute(
                text(f'SELECT "{column}"::text FROM "{table}" WHERE "{column}"::text ~ :pattern'),
                {"pattern": pattern},
            )
            for (value,) in rows:
                referenced.update(compiled.findall(value or ""))

    kept = [c for c in candidates if c.name not in referenced]
    skipped = len(candidates) - len(kept)
    if skipped:
        logger.info("Tozalash: %s ta blob bazada havolasi borligi uchun qoldirildi", skipped)
    return kept


async def purge(session: AsyncSession, candidate: Candidate) -> bool:
    """Bitta blob'ni bazadan va diskdan oʻchiradi. Oʻchirgan boʻlsa ``True``.

    Blob satri ``FOR UPDATE`` bilan qulflanadi va shartlar qayta
    tekshiriladi: tanlov bilan oʻchirish orasida kimdir aynan shu faylni
    qayta yuklagan boʻlishi mumkin. Yuklash yangi yozuvni blob'ga FK orqali
    bogʻlaydi va bu qulf bilan navbatga turadi.

    Avval baza commit qilinadi, keyin fayl oʻchiriladi: aksincha boʻlsa,
    commit muvaffaqiyatsiz chiqqanda bazada diskda yoʻq faylga havola qolardi.
    """
    blob = await session.scalar(
        select(FileBlob).where(FileBlob.id == candidate.blob_id).with_for_update()
    )
    if blob is None:
        await session.rollback()
        return False

    still_needed = await session.scalar(
        select(func.count())
        .select_from(StoredFile)
        .outerjoin(FileUsage, FileUsage.file_id == StoredFile.id)
        .where(
            StoredFile.blob_id == blob.id,
            (StoredFile.is_active.is_(True)) | (FileUsage.id.isnot(None)),
        )
    )
    if still_needed:
        await session.rollback()
        return False

    await session.execute(delete(StoredFile).where(StoredFile.blob_id == blob.id))
    await session.execute(delete(FileBlob).where(FileBlob.id == blob.id))
    await session.commit()

    path = settings.absolute_upload_dir / candidate.stored_path
    try:
        path.unlink(missing_ok=True)
    except OSError:
        # Baza allaqachon toza — diskda yetim fayl qoladi, lekin havola buzilmaydi.
        logger.exception("Tozalash: faylni diskdan oʻchirib boʻlmadi: %s", path)
    return True
