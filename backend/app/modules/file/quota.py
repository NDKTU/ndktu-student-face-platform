"""Oʻqituvchining fayl yuklash limiti.

Qoidalar:

* Ishlatilgan hajm saqlanmaydi, har safar hisoblanadi: foydalanuvchining faol
  (``is_active``) yozuvlaridagi blob hajmlari yigʻindisi. Shuning uchun fayl
  oʻchirilganda hajm oʻz-oʻzidan ayriladi, hisoblagich esa hech qachon
  haqiqatdan chetlashmaydi.
* Bitta blob ikki oʻqituvchida boʻlsa, ikkalasiga toʻliq hisoblanadi: diskda
  nusxa bitta, lekin limit diskni emas, har kimning oʻz hisobini koʻrsatadi.
  Aks holda «faylni oʻchirdim, joy boʻshamadi» degan tushunarsiz holat chiqadi.
* Limit: individual (``users.storage_quota_bytes``), boʻlmasa umumiy
  (``app_settings``), u ham boʻlmasa ``settings.file_quota.default_bytes``.
* Admin cheklanmaydi. Rol bazadan oʻqiladi, ``user.roles`` dan emas: faol
  koʻrinish (``X-Active-Role``) soʻrov davomida rollarni toraytiradi, limit
  esa koʻrinishga qarab oʻzgarmasligi kerak.
"""

from dataclasses import dataclass
from typing import Literal

from core.config import settings
from fastapi import HTTPException, status
from sqlalchemy import and_, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.app_setting.model import get_setting, set_setting
from app.modules.auth.model import Role, Teacher, User, UserRole
from app.modules.file.model import FileBlob, FileQuotaChange, StoredFile
from app.modules.organization_structure.model import Kafedra

MB = 1024 * 1024
GB = 1024 * MB

#: Admin cheklovsiz boʻlishi uchun kamida shuncha limit qoʻyish mumkin emas —
#: «0» kiritilsa oʻqituvchi bitta rasm ham yuklay olmay qoladi.
MIN_LIMIT_BYTES = MB

DEFAULT_LIMIT_KEY = "file_quota_default_bytes"

# pg_advisory_xact_lock(int, int) — birinchi son boshqa qulflar bilan
# toʻqnashmasligi uchun nom maydoni.
_LOCK_NAMESPACE = 7301


def format_size(size: int) -> str:
    """Frontenddagi ``formatSize`` bilan bir xil: 1 GB = 1024 MB."""
    size = max(0, size)
    if size >= GB:
        value, unit = size / GB, "GB"
    else:
        value, unit = size / MB, "MB"
    text_value = f"{value:.1f}".rstrip("0").rstrip(".")
    return f"{text_value} {unit}"


@dataclass
class QuotaState:
    #: ``None`` — cheklanmagan (admin).
    limit_bytes: int | None
    used_bytes: int
    file_count: int
    #: Individual limit qoʻyilganmi.
    is_custom: bool

    @property
    def remaining_bytes(self) -> int | None:
        if self.limit_bytes is None:
            return None
        return max(0, self.limit_bytes - self.used_bytes)


# ─── Limit ────────────────────────────────────────────────────────────


async def default_limit(session: AsyncSession) -> int:
    stored = await get_setting(session, DEFAULT_LIMIT_KEY)
    if stored is not None:
        try:
            return int(stored)
        except ValueError:
            pass
    return settings.file_quota.default_bytes


async def _admin_user_ids(session: AsyncSession, user_ids: list[int]) -> set[int]:
    if not user_ids:
        return set()
    rows = await session.scalars(
        select(UserRole.user_id)
        .join(Role, Role.id == UserRole.role_id)
        .where(UserRole.user_id.in_(user_ids), func.lower(Role.name) == "admin")
    )
    return set(rows.all())


async def is_exempt(session: AsyncSession, user_id: int) -> bool:
    return user_id in await _admin_user_ids(session, [user_id])


async def effective_limit(session: AsyncSession, user_id: int) -> tuple[int | None, bool]:
    """``(limit, individualmi)``. Admin uchun ``(None, False)``."""
    if await is_exempt(session, user_id):
        return None, False
    custom = await session.scalar(select(User.storage_quota_bytes).where(User.id == user_id))
    if custom is not None:
        return custom, True
    return await default_limit(session), False


async def usage(session: AsyncSession, user_id: int) -> tuple[int, int]:
    """``(ishlatilgan_bayt, fayllar_soni)`` — faqat faol yozuvlar."""
    row = (
        await session.execute(
            select(func.coalesce(func.sum(FileBlob.size_bytes), 0), func.count(StoredFile.id))
            .select_from(StoredFile)
            .join(FileBlob, FileBlob.id == StoredFile.blob_id)
            .where(StoredFile.owner_user_id == user_id, StoredFile.is_active.is_(True))
        )
    ).one()
    return int(row[0]), int(row[1])


async def get_state(session: AsyncSession, user_id: int) -> QuotaState:
    limit, is_custom = await effective_limit(session, user_id)
    used, count = await usage(session, user_id)
    return QuotaState(limit_bytes=limit, used_bytes=used, file_count=count, is_custom=is_custom)


async def lock(session: AsyncSession, user_id: int) -> None:
    """Bir foydalanuvchining yuklashlarini tranzaksiya oxirigacha navbatga qoʻyadi.

    Busiz bir vaqtda yuborilgan beshta fayl har biri «joy bor» deb oʻtib
    ketadi. Qulf commit yoki rollback bilan oʻzi boʻshaydi.
    """
    await session.execute(
        text("SELECT pg_advisory_xact_lock(:ns, :uid)"), {"ns": _LOCK_NAMESPACE, "uid": user_id}
    )


def exceeded_error(limit: int, used: int, file_bytes: int) -> HTTPException:
    """413 — limitdan oshdi. ``detail`` ataylab satr: yuklash xatosini
    koʻrsatadigan joylarning bir qismi (masalan, savol muharriri) uni
    toʻgʻridan-toʻgʻri matn sifatida chiqaradi."""
    remaining = max(0, limit - used)
    if remaining == 0:
        message = "Fayl yuklash limitingiz tugagan. Qolgan hajm: 0 MB."
    else:
        message = (
            f"Fayl hajmi ({format_size(file_bytes)}) qolgan hajmdan "
            f"({format_size(remaining)}) katta."
        )
    return HTTPException(status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail=message)


# ─── Admin: limitni oʻzgartirish ──────────────────────────────────────


def validate_limit(value: int) -> None:
    upper = settings.file_quota.max_bytes
    if value < MIN_LIMIT_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Limit {format_size(MIN_LIMIT_BYTES)} dan kam boʻlmasligi kerak",
        )
    if value > upper:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Limit {format_size(upper)} dan oshmasligi kerak",
        )


async def set_default_limit(session: AsyncSession, value: int, actor_id: int) -> None:
    validate_limit(value)
    old = await default_limit(session)
    await set_setting(session, DEFAULT_LIMIT_KEY, str(value), actor_id)
    if old != value:
        session.add(FileQuotaChange(user_id=None, old_bytes=old, new_bytes=value, changed_by_user_id=actor_id))
    await session.commit()


async def set_user_limit(session: AsyncSession, user_id: int, value: int | None, actor_id: int) -> None:
    """``value=None`` — individual limit olib tashlanadi, umumiy ishlaydi."""
    if value is not None:
        validate_limit(value)
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Foydalanuvchi topilmadi")
    old = user.storage_quota_bytes
    if old != value:
        user.storage_quota_bytes = value
        session.add(
            FileQuotaChange(user_id=user_id, old_bytes=old, new_bytes=value, changed_by_user_id=actor_id)
        )
    await session.commit()


# ─── Admin: oʻqituvchilar roʻyxati ────────────────────────────────────

QuotaSort = Literal["used_desc", "remaining_asc", "name"]


@dataclass
class TeacherQuotaRow:
    user_id: int
    full_name: str
    kafedra_name: str | None
    custom_limit_bytes: int | None
    state: QuotaState


async def list_teachers(
    session: AsyncSession,
    *,
    search: str | None,
    kafedra_id: int | None,
    sort: QuotaSort,
    page: int,
    size: int,
) -> tuple[list[TeacherQuotaRow], int, int]:
    """``(qatorlar, jami, umumiy_limit)``.

    Hammasi bitta soʻrov bilan: har bir oʻqituvchi uchun alohida soʻrov
    yuborilsa, sahifa minglab oʻqituvchida sezilarli sekinlashadi.
    """
    default = await default_limit(session)

    used = func.coalesce(func.sum(FileBlob.size_bytes), 0)
    file_count = func.count(StoredFile.id)
    limit_expr = func.coalesce(User.storage_quota_bytes, default)

    filters = []
    if search:
        filters.append(Teacher.full_name.ilike(f"%{search.strip()}%"))
    if kafedra_id is not None:
        filters.append(Teacher.kafedra_id == kafedra_id)

    stmt = (
        select(
            Teacher.user_id,
            Teacher.full_name,
            Kafedra.name,
            User.storage_quota_bytes,
            used.label("used"),
            file_count.label("file_count"),
        )
        .select_from(Teacher)
        .join(User, User.id == Teacher.user_id)
        .outerjoin(Kafedra, Kafedra.id == Teacher.kafedra_id)
        .outerjoin(
            StoredFile,
            and_(StoredFile.owner_user_id == User.id, StoredFile.is_active.is_(True)),
        )
        .outerjoin(FileBlob, FileBlob.id == StoredFile.blob_id)
        .where(*filters)
        .group_by(Teacher.id, Teacher.user_id, Teacher.full_name, Kafedra.name, User.storage_quota_bytes)
    )

    if sort == "name":
        stmt = stmt.order_by(Teacher.full_name, Teacher.id)
    elif sort == "remaining_asc":
        stmt = stmt.order_by((limit_expr - used).asc(), Teacher.full_name)
    else:
        stmt = stmt.order_by(used.desc(), Teacher.full_name)

    total = await session.scalar(
        select(func.count()).select_from(Teacher).join(User, User.id == Teacher.user_id).where(*filters)
    ) or 0

    rows = (await session.execute(stmt.offset((page - 1) * size).limit(size))).all()
    admins = await _admin_user_ids(session, [row.user_id for row in rows])

    items = []
    for row in rows:
        exempt = row.user_id in admins
        custom = row.storage_quota_bytes
        items.append(
            TeacherQuotaRow(
                user_id=row.user_id,
                full_name=row.full_name,
                kafedra_name=row.name,
                custom_limit_bytes=custom,
                state=QuotaState(
                    limit_bytes=None if exempt else (custom if custom is not None else default),
                    used_bytes=int(row.used),
                    file_count=int(row.file_count),
                    is_custom=custom is not None,
                ),
            )
        )
    return items, total, default
