from datetime import date as date_type
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.quiz.models.quiz import Quiz


class AcademicYear(Base, IdIntPk, TimestampMixin):
    __tablename__ = "academic_years"

    name: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    start_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    end_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    semesters: Mapped[list["Semester"]] = relationship(
        "Semester", back_populates="academic_year", cascade="all, delete-orphan"
    )

    def __str__(self):
        return self.name


class Semester(Base, IdIntPk, TimestampMixin):
    __tablename__ = "semesters"
    __table_args__ = (UniqueConstraint("academic_year_id", "number", name="uq_semester_year_number"),)

    academic_year_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("academic_years.id", ondelete="CASCADE"), nullable=False, index=True
    )
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    start_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    end_date: Mapped[date_type] = mapped_column(Date, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    academic_year: Mapped["AcademicYear"] = relationship("AcademicYear", back_populates="semesters")
    
    quizzes: Mapped[list["Quiz"]] = relationship(
        "Quiz", back_populates="semester", cascade="all, delete-orphan"
    )

    def __str__(self):
        return f"{self.academic_year_id}-{self.number}"
