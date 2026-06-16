from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.course.model import Course
    from app.modules.course_structure.models import Topic
    from app.modules.group.models.group import Group
    from app.modules.lesson.model import Lesson
    from app.modules.subject.models.subject_teacher import SubjectTeacher


class Resource(Base, IdIntPk, TimestampMixin):
    __tablename__ = "resources"

    subject_teacher_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("subject_teachers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    group_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("groups.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    lesson_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("lessons.id", ondelete="SET NULL"),
        nullable=True,
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

    main_text: Mapped[str] = mapped_column(Text, nullable=False)

    links: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    files: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    subject_teacher: Mapped["SubjectTeacher"] = relationship("SubjectTeacher", back_populates="resources")

    group: Mapped["Group | None"] = relationship("Group", back_populates="resources")

    lesson: Mapped["Lesson | None"] = relationship("Lesson")

    course: Mapped["Course | None"] = relationship("Course", back_populates="resources")

    topic: Mapped["Topic | None"] = relationship("Topic")

    def __str__(self):
        return f"Resource {self.id} (subject_teacher_id={self.subject_teacher_id}, group_id={self.group_id})"
