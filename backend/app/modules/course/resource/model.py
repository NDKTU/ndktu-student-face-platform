from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.user.model import User
    from app.modules.course.course.model import Course
    from app.modules.course.lesson.model import Lesson


class Resource(Base, IdIntPk, TimestampMixin):
    __tablename__ = "resources"

    lesson_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("lessons.id", ondelete="CASCADE"), nullable=True, index=True
    )
    course_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=True, index=True
    )

    resource_type: Mapped[str] = mapped_column(String(10), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)

    file_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    link_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    text_content: Mapped[str | None] = mapped_column(Text, nullable=True)

    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    lesson: Mapped["Lesson | None"] = relationship("Lesson", back_populates="resources")
    course: Mapped["Course | None"] = relationship("Course", back_populates="resources")
    created_by: Mapped["User | None"] = relationship("User")

    def __str__(self):
        return f"Resource {self.id} ({self.resource_type}: {self.title})"
