from datetime import date as date_type
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.course.model import Course
    from app.modules.course_structure.models import Topic
    from app.modules.group.models.group import Group
    from app.modules.subject.models.subject_teacher import SubjectTeacher
    from app.modules.user.models.user import User


class Lesson(Base, IdIntPk, TimestampMixin):
    __tablename__ = "lessons"

    subject_teacher_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("subject_teachers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    group_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    course_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("courses.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    topic_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("course_topics.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    lesson_type: Mapped[str | None] = mapped_column(String(20), nullable=True)

    topic: Mapped[str] = mapped_column(String(255), nullable=False)
    date: Mapped[date_type] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    subject_teacher: Mapped["SubjectTeacher"] = relationship("SubjectTeacher")
    group: Mapped["Group"] = relationship("Group")
    course: Mapped["Course | None"] = relationship("Course", back_populates="lessons")
    course_topic: Mapped["Topic | None"] = relationship("Topic")
    results: Mapped[list["LessonResult"]] = relationship(
        "LessonResult", back_populates="lesson", cascade="all, delete-orphan"
    )

    def __str__(self):
        return f"Lesson {self.id} ({self.topic} @ {self.date})"


class LessonResult(Base, IdIntPk, TimestampMixin):
    __tablename__ = "lesson_results"
    __table_args__ = (UniqueConstraint("lesson_id", "user_id", name="uq_lesson_result_per_user"),)

    lesson_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("lessons.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    user_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    attendance: Mapped[str] = mapped_column(String(16), nullable=False)
    grade: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    lesson: Mapped["Lesson"] = relationship("Lesson", back_populates="results")
    user: Mapped["User"] = relationship("User")

    def __str__(self):
        return f"LessonResult lesson={self.lesson_id} user={self.user_id}"
