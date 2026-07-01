from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.faculty.model import Faculty
    from app.modules.group.models.group_teachers import GroupTeacher
    from app.modules.quiz.models.quiz import Quiz
    from app.modules.result.model import Result
    from app.modules.speciality.model import Speciality
    from app.modules.student.model import Student


class Group(Base, IdIntPk, TimestampMixin):
    __tablename__ = "groups"
    faculty_id: Mapped[int] = mapped_column(ForeignKey("faculties.id"))
    speciality_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("specialities.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(255), unique=True)

    faculty: Mapped["Faculty"] = relationship("Faculty", back_populates="groups")
    speciality: Mapped["Speciality | None"] = relationship("Speciality", back_populates="groups")
    students: Mapped[list["Student"]] = relationship("Student", back_populates="group")

    quizzes: Mapped[list["Quiz"]] = relationship("Quiz", back_populates="group")

    results: Mapped[list["Result"]] = relationship("Result", back_populates="group")

    group_teachers: Mapped[list["GroupTeacher"]] = relationship(
        "GroupTeacher", back_populates="group", cascade="all, delete-orphan"
    )

    def __str__(self):
        return self.name
