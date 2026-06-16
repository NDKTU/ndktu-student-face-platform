from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.course_structure.models import Topic
    from app.modules.lesson.model import Lesson
    from app.modules.course.model import Course
    from app.modules.user.models.user import User


class Assignment(Base, IdIntPk, TimestampMixin):
    __tablename__ = "assignments"

    course_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    topic_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("course_topics.id", ondelete="SET NULL"), nullable=True, index=True
    )
    lesson_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("lessons.id", ondelete="SET NULL"), nullable=True, index=True
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
    topic: Mapped["Topic | None"] = relationship("Topic")
    lesson: Mapped["Lesson | None"] = relationship("Lesson")
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
