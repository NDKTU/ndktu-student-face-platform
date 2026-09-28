from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.model import User


class NotificationType:
    """Bildirishnoma manbasi.

    Satr sifatida saqlanadi, Postgres enum emas: yangi tur qo'shish uchun
    migratsiya kerak bo'lmasligi lozim — platformada bildirishnoma
    yuboradigan joylar ko'payib boradi.
    """

    #: ROYD'dagi murojaat holati o'zgardi (integration/royd webhook).
    REQUEST_STATUS = "request_status"
    #: Umumiy xabar — manbasi ko'rsatilmagan.
    GENERAL = "general"


class Notification(Base, IdIntPk, TimestampMixin):
    """Foydalanuvchiga ko'rsatiladigan bildirishnoma.

    Nega kerak. Murojaat ROYD'da ko'riladi, holati esa o'sha yerda
    o'zgaradi. Talaba buni bilishi uchun yo sahifani qayta-qayta ochishi,
    yo bildirishnoma olishi kerak. Ikkinchisi tanlandi.

    ``payload`` ichida manbaga oid identifikatorlar turadi (masalan
    ``tracking_no``), shuning uchun interfeys bildirishnomadan to'g'ri
    joyga o'tkaza oladi. Alohida ustunlar kiritilmadi: har yangi manba
    o'z ustunini talab qilardi.
    """

    __tablename__ = "notifications"
    __table_args__ = (
        # Asosiy so'rov: «mening o'qilmaganlarim, yangisidan boshlab».
        Index("ix_notifications_user_id_is_read_id", "user_id", "is_read", "id"),
    )

    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    #: `NotificationType` qiymatlari.
    type: Mapped[str] = mapped_column(String(32), nullable=False, default=NotificationType.GENERAL)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped["User"] = relationship("User")
