from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.course.model import Course


class Syllabus(Base, IdIntPk, TimestampMixin):
    __tablename__ = "syllabuses"

    course_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )

    goals: Mapped[str | None] = mapped_column(Text, nullable=True)
    learning_outcomes: Mapped[str | None] = mapped_column(Text, nullable=True)
    prerequisites: Mapped[str | None] = mapped_column(Text, nullable=True)
    methodical_recommendations: Mapped[str | None] = mapped_column(Text, nullable=True)

    literature: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    grading_scheme: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    competencies: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    file_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    course: Mapped["Course"] = relationship("Course")

    def __str__(self):
        return f"Syllabus {self.id} (course={self.course_id})"
