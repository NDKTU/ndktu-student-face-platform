"""Zoom sahifasi: jonli dars seanslari va ulardagi yuz tekshiruvlari.

Seans — Zoom havolasi + guruhlar + vaqt oralig'i. Ilgari havola darsning
resursi edi va talaba istalgan vaqtda qo'shila olardi; endi imzo faqat
seans vaqtida, faqat biriktirilgan guruh talabasiga va yuz tasdiqlangach
beriladi (`repository.py::_admit_student`).
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.model import User
    from app.modules.organization_structure.model import Group
    from app.modules.quiz.model import Subject


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

    subject: Mapped[Subject | None] = relationship("Subject")
    created_by: Mapped[User | None] = relationship("User")
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
