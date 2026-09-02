from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.model import User


class Announcement(Base, IdIntPk, TimestampMixin):
    """E'lon: oddiy xabar yoki ro'yxatdan o'tiladigan tadbir.

    Ikkalasi bitta jadvalda: farq faqat `registration_enabled` da. Alohida tur
    kiritilsa, matn, banner va auditoriya mantig'i ikki joyda takrorlanardi.
    """

    __tablename__ = "announcements"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    #: Oddiy matn, HTML emas — frontend uni qatorlarni saqlab chiqaradi.
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    #: Banner. Rasm kutubxonadan yoki qurilmadan yuklanadi — bu yerda faqat URL.
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    #: draft | published | archived. Qoralama talabaga ko'rinmaydi.
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")
    #: Lentaning tepasiga qadab qo'yish.
    pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    #: Ko'rsatish oynasi. Bo'sh `publish_at` — status yetarli, bo'sh
    #: `expires_at` — muddatsiz.
    publish_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    #: Tadbir tafsilotlari. Oddiy e'londa hammasi bo'sh qoladi.
    registration_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    event_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    link_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    #: Bo'sh — joylar soni cheklanmagan.
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    registration_deadline: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    #: all | faculty | group | level. Qiymatlar `audience_values` da:
    #: guruhda — id lar, fakultet va kursda — HEMIS'dagi satrlar.
    audience_kind: Mapped[str] = mapped_column(String(16), nullable=False, default="all")
    audience_values: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, default=list)

    created_by_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    created_by: Mapped["User | None"] = relationship("User", foreign_keys=[created_by_user_id])
    registrations: Mapped[list["AnnouncementRegistration"]] = relationship(
        "AnnouncementRegistration",
        back_populates="announcement",
        cascade="all, delete-orphan",
    )

    def __str__(self) -> str:
        return f"Announcement(id={self.id}, title={self.title})"


class AnnouncementRegistration(Base, IdIntPk, TimestampMixin):
    """Tadbirga yozilish.

    Bekor qilinganda qator o'chirilmaydi, `status` almashadi: kim yozilib,
    keyin chiqib ketgani tashkilotchiga ko'rinib tursin. Unikal indeks esa
    tugmani ikki marta bosish qayta qator yaratmasligini kafolatlaydi.
    """

    __tablename__ = "announcement_registrations"
    __table_args__ = (UniqueConstraint("announcement_id", "user_id", name="uq_announcement_registration"),)

    announcement_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("announcements.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    #: registered | cancelled
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="registered")

    announcement: Mapped[Announcement] = relationship("Announcement", back_populates="registrations")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])

    def __str__(self) -> str:
        return f"AnnouncementRegistration(announcement={self.announcement_id}, user={self.user_id})"
