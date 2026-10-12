"""Zoom sahifasi: jonli dars seanslari va ulardagi yuz tekshiruvlari.

Seans — Zoom havolasi + guruhlar + vaqt oralig'i. Ilgari havola darsning
resursi edi va talaba istalgan vaqtda qo'shila olardi; endi imzo faqat
seans vaqtida, faqat biriktirilgan guruh talabasiga va yuz tasdiqlangach
beriladi (`repository.py::_admit_student`).
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.model import Teacher, User
    from app.modules.organization_structure.model import Group
    from app.modules.quiz.model import Subject


class ZoomAccount(Base, IdIntPk, TimestampMixin):
    """Zoom akkaunti: unda ikki ilova bo'ladi va ikkalasi ham SHU akkauntda.

    * Server-to-Server OAuth (`api_*`) — uchrashuvni yaratish, registrant,
      webhook. Ixtiyoriy: bo'lmasa, seans faqat havola bilan yaratiladi.
    * General App + Meeting SDK (`sdk_*`) — talabaning sahifadagi kirishi.
      Majburiy: nashr etilmagan SDK ilovasi boshqa akkaunt uchrashuviga
      kirmaydi (Zoom xatosi 4011), shuning uchun har akkauntga o'zi kerak.

    Sirlar `core/utils/secret_box.py` bilan shifrlangan va API'da qaytmaydi.
    `.env` dagi kalitlar alohida, «Asosiy (.env)» akkaunti sifatida ishlaydi
    (`accounts.py::env_credentials`) — `zoom_account_id` bo'sh seanslar shu.
    """

    __tablename__ = "zoom_accounts"

    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    #: Uchrashuv kim nomidan ochiladi — shu akkauntdagi litsenziyali foydalanuvchi.
    host_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    api_account_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    api_client_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    api_client_secret_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    sdk_key: Mapped[str] = mapped_column(String(128), nullable=False)
    sdk_secret_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    webhook_secret_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true", default=True)


class ZoomSession(Base, IdIntPk, TimestampMixin):
    __tablename__ = "zoom_sessions"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    #: «Copy Invite Link» havolasi; uchrashuv raqami va paroli shundan olinadi.
    link_url: Mapped[str] = mapped_column(String(500), nullable=False)
    #: Naiv UTC — `created_at` bilan bir xil (`core/mixins/time_stamp_mixin`).
    starts_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    subject_id: Mapped[int | None] = mapped_column(
        ForeignKey("subjects.id", ondelete="SET NULL"), nullable=True, index=True
    )
    face_check_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true", default=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true", default=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    #: Uchrashuv raqami — havoladan yoki Zoom API javobidan. Webhook hodisasi
    #: seansga shu orqali bog'lanadi (bir xonada bir necha seans bo'lsa — vaqt bo'yicha).
    zoom_meeting_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, index=True)
    #: Uchrashuvni bekend Zoom API orqali yaratgan: vaqt/nom o'zgarsa yangilaydi,
    #: seans o'chsa o'chiradi, talabani registrant qilib shaxsiy token bilan kiritadi.
    zoom_managed: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false", default=False)
    #: Uchrashuv qaysi akkauntda. Bo'sh — `.env` dagi kalitlar («Asosiy (.env)»).
    #: RESTRICT: akkaunt o'chsa, seans qaysi kalit bilan imzolanishini bilmay qolardi.
    zoom_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("zoom_accounts.id", ondelete="RESTRICT"), nullable=True, index=True
    )

    #: Darsni olib boradigan o'qituvchi (`users.id`, `teachers.id` emas). U
    #: seansni boshqaradi: yuz tekshiruvisiz kiradi, host sifatida boshlaydi.
    teacher_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    zoom_account: Mapped[ZoomAccount | None] = relationship("ZoomAccount")
    teacher: Mapped[Teacher | None] = relationship(
        "Teacher", primaryjoin="foreign(ZoomSession.teacher_user_id) == Teacher.user_id", viewonly=True
    )
    subject: Mapped[Subject | None] = relationship("Subject")
    created_by: Mapped[User | None] = relationship("User", foreign_keys=[created_by_user_id])
    group_links: Mapped[list[ZoomSessionGroup]] = relationship(
        "ZoomSessionGroup", cascade="all, delete-orphan", back_populates="session"
    )


class ZoomSessionGroup(Base, IdIntPk, TimestampMixin):
    __tablename__ = "zoom_session_groups"
    __table_args__ = (UniqueConstraint("session_id", "group_id", name="uq_zoom_session_group"),)

    session_id: Mapped[int] = mapped_column(
        ForeignKey("zoom_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True)

    session: Mapped[ZoomSession] = relationship("ZoomSession", back_populates="group_links")
    group: Mapped[Group] = relationship("Group")


class ZoomFaceCheck(Base, IdIntPk, TimestampMixin):
    """Seansdagi yuz tekshiruvi — `course.model.LessonFaceCheck` bilan bir shakl.

    `join` — kirishdagi tekshiruv (imzo shundan keyingina beriladi),
    `random` — dars davomidagi tasodifiy. Rasm faqat muammoli holatda saqlanadi.
    """

    __tablename__ = "zoom_face_checks"
    __table_args__ = (Index("ix_zoom_face_checks_session_user_time", "session_id", "user_id", "created_at"),)

    session_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("zoom_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    stage: Mapped[str] = mapped_column(String(10), nullable=False)
    # ok | no_face | multiple_faces | different_person | no_reference | no_camera | page_hidden
    status: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    image_name: Mapped[str | None] = mapped_column(String(255), nullable=True)


class ZoomRegistrant(Base, IdIntPk, TimestampMixin):
    """Talabaning uchrashuvdagi registranti: shaxsiy kirish tokeni (`tk`).

    Har kirishda Zoom'ga murojaat qilmaslik uchun saqlanadi. `registrant_id`
    webhook hodisasidagi ishtirokchini talabaga bog'laydi.
    """

    __tablename__ = "zoom_registrants"
    __table_args__ = (UniqueConstraint("session_id", "user_id", name="uq_zoom_registrant_session_user"),)

    session_id: Mapped[int] = mapped_column(
        ForeignKey("zoom_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    registrant_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    join_token: Mapped[str] = mapped_column(String(512), nullable=False)


class ZoomParticipantEvent(Base, IdIntPk, TimestampMixin):
    """Zoom webhook: kim uchrashuvga kirdi va chiqdi.

    `user_id` bo'sh — ishtirokchi LMS orqali kirmagan (begona yoki o'qituvchi).
    Zoom hodisani qayta yuborishi mumkin: noyob indeks takrorni tashlaydi.
    """

    __tablename__ = "zoom_participant_events"
    __table_args__ = (
        UniqueConstraint(
            "session_id", "participant_key", "event", "occurred_at", name="uq_zoom_participant_event"
        ),
    )

    session_id: Mapped[int] = mapped_column(
        ForeignKey("zoom_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    #: joined | left
    event: Mapped[str] = mapped_column(String(10), nullable=False)
    #: Zoom'dagi ishtirokchi kaliti (`participant_uuid`, bo'lmasa `user_id`).
    participant_key: Mapped[str] = mapped_column(String(128), nullable=False)
    participant_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    #: Naiv UTC — Zoom'dagi `join_time` / `leave_time`.
    occurred_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
