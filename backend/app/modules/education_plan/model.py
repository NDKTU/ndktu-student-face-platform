from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.speciality.model import Speciality
    from app.modules.subject.models.subject import Subject


class EducationPlan(Base, IdIntPk, TimestampMixin):
    __tablename__ = "education_plans"

    speciality_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("specialities.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)

    speciality: Mapped["Speciality"] = relationship("Speciality", back_populates="education_plans")
    subjects: Mapped[list["EducationPlanSubject"]] = relationship(
        "EducationPlanSubject",
        back_populates="education_plan",
        cascade="all, delete-orphan",
    )

    def __str__(self):
        return f"{self.name} ({self.year})"


class EducationPlanSubject(Base, IdIntPk, TimestampMixin):
    __tablename__ = "education_plan_subjects"
    __table_args__ = (
        UniqueConstraint("education_plan_id", "subject_id", "semester", name="uq_plan_subject_semester"),
    )

    education_plan_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("education_plans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    subject_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("subjects.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    semester: Mapped[int] = mapped_column(Integer, nullable=False)

    education_plan: Mapped["EducationPlan"] = relationship("EducationPlan", back_populates="subjects")
    subject: Mapped["Subject"] = relationship("Subject")

    def __str__(self):
        return f"Plan {self.education_plan_id} subject={self.subject_id} sem={self.semester}"
