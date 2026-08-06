from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.user.model import User
    from app.modules.course.content.model import CourseMaterial
    from app.modules.course.course.model import Course
    from app.modules.course.lesson.model import Lesson


class Assignment(Base, IdIntPk, TimestampMixin):
    __tablename__ = "assignments"

    course_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lesson_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("lessons.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Задание, привязанное к видеоуроку. SET NULL, а не CASCADE: у задания
    # висят сданные работы с оценками, и удаление урока не должно их уносить.
    # course_id остаётся NOT NULL, поэтому осиротевшее задание не пропадает —
    # оно просто становится общим для курса.
    material_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("course_materials.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_by_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    deadline: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    max_grade: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    allow_file: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    allow_text: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    allowed_file_types: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    course: Mapped["Course"] = relationship("Course")
    lesson: Mapped["Lesson | None"] = relationship("Lesson")
    material: Mapped["CourseMaterial | None"] = relationship("CourseMaterial")
    created_by: Mapped["User | None"] = relationship("User", foreign_keys=[created_by_user_id])
    submissions: Mapped[list["AssignmentSubmission"]] = relationship(
        "AssignmentSubmission", back_populates="assignment", cascade="all, delete-orphan"
    )

    def __str__(self):
        return f"Assignment {self.id} ({self.title})"


class AssignmentSubmission(Base, IdIntPk, TimestampMixin):
    __tablename__ = "assignment_submissions"
    __table_args__ = (UniqueConstraint("assignment_id", "user_id", name="uq_submission_per_user"),)

    assignment_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    submitted_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    submitted_files: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")

    grade: Mapped[int | None] = mapped_column(Integer, nullable=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    graded_by_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    graded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    assignment: Mapped["Assignment"] = relationship("Assignment", back_populates="submissions")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    graded_by: Mapped["User | None"] = relationship("User", foreign_keys=[graded_by_user_id])

    def __str__(self):
        return f"Submission {self.id} (assignment={self.assignment_id}, user={self.user_id})"
