"""Admin interfeysdan o'zgartiriladigan tizim sozlamalari.

`.env` dagi qiymatni o'zgartirish uchun serverga kirib, qayta ishga tushirish
kerak. Admin sahifadan o'zgartiradigan qiymatlar shu jadvalda turadi; yozuv
bo'lmasa chaqiruvchi `core/config.py` dagi zaxira qiymatni oladi.
"""

from sqlalchemy import ForeignKey, String, Text, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin


class AppSetting(Base, IdIntPk, TimestampMixin):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    updated_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    def __str__(self):
        return f"AppSetting {self.key}"


async def get_setting(session: AsyncSession, key: str) -> str | None:
    return await session.scalar(select(AppSetting.value).where(AppSetting.key == key))


async def set_setting(session: AsyncSession, key: str, value: str, updated_by_user_id: int | None) -> None:
    """Commit qilmaydi: chaqiruvchi o'z o'zgarishi bilan birga saqlaydi."""
    row = await session.scalar(select(AppSetting).where(AppSetting.key == key))
    if row is None:
        session.add(AppSetting(key=key, value=value, updated_by_user_id=updated_by_user_id))
    else:
        row.value = value
        row.updated_by_user_id = updated_by_user_id
    await session.flush()
