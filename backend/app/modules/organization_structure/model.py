from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.model import Employee, Student, Teacher, User
    from app.modules.quiz.model import Quiz
    from app.modules.quiz.model import Result


class Faculty(Base, IdIntPk, TimestampMixin):
    __tablename__ = "faculties"
    name: Mapped[str] = mapped_column(String(50), unique=True)

    def __str__(self):
        return self.name

    kafedras: Mapped[list["Kafedra"]] = relationship("Kafedra", back_populates="faculty")

    groups: Mapped[list["Group"]] = relationship("Group", back_populates="faculty")


class Kafedra(Base, IdIntPk, TimestampMixin):
    __tablename__ = "kafedras"

    faculty_id: Mapped[int] = mapped_column(ForeignKey("faculties.id"))
    name: Mapped[str] = mapped_column(String(255), unique=True)

    faculty: Mapped["Faculty"] = relationship("Faculty", back_populates="kafedras")

    teachers: Mapped[list["Teacher"]] = relationship("Teacher", back_populates="kafedra")
    specialities: Mapped[list["Speciality"]] = relationship("Speciality", back_populates="kafedra")

    def __str__(self):
        return self.name


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


class GroupTeacher(Base, IdIntPk, TimestampMixin):
    __tablename__ = "group_teachers"
    __table_args__ = (UniqueConstraint("group_id", "teacher_id", name="idx_unique_group_teacher"),)

    group_id: Mapped[int] = mapped_column(ForeignKey("groups.id"))
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    group: Mapped["Group"] = relationship("Group", back_populates="group_teachers")
    teacher: Mapped["User"] = relationship("User", back_populates="group_teachers")

    def __str__(self):
        return f"{self.group_id} - {self.teacher_id}"


class Speciality(Base, IdIntPk, TimestampMixin):
    __tablename__ = "specialities"

    kafedra_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("kafedras.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)

    kafedra: Mapped["Kafedra"] = relationship("Kafedra", back_populates="specialities")
    groups: Mapped[list["Group"]] = relationship("Group", back_populates="speciality")

    def __str__(self):
        return self.name


class Department(Base, IdIntPk, TimestampMixin):
    __tablename__ = "departments"

    name: Mapped[str] = mapped_column(String(255), unique=True)

    employees: Mapped[list["Employee"]] = relationship("Employee", back_populates="department")

    def __str__(self):
        return self.name
