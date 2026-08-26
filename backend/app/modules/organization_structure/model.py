from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.external_ref import ExternalRefMixin, external_ref_index
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.model import Student, Teacher
    from app.modules.quiz.model import Quiz, Result


class Faculty(Base, IdIntPk, TimestampMixin, ExternalRefMixin):
    __tablename__ = "faculties"
    __table_args__ = (external_ref_index("faculties"),)

    # 255, а не 50: названия факультетов в EPOS длиннее прежнего лимита.
    name: Mapped[str] = mapped_column(String(255), unique=True)

    def __str__(self):
        return self.name

    kafedras: Mapped[list["Kafedra"]] = relationship("Kafedra", back_populates="faculty")

    groups: Mapped[list["Group"]] = relationship("Group", back_populates="faculty")


class Kafedra(Base, IdIntPk, TimestampMixin, ExternalRefMixin):
    __tablename__ = "kafedras"
    # Уникальность в пределах факультета, а не глобальная: одноимённые кафедры
    # на разных факультетах — норма.
    __table_args__ = (
        UniqueConstraint("faculty_id", "name", name="uq_kafedras_faculty_id_name"),
        external_ref_index("kafedras"),
    )

    faculty_id: Mapped[int] = mapped_column(ForeignKey("faculties.id"))
    name: Mapped[str] = mapped_column(String(255))

    faculty: Mapped["Faculty"] = relationship("Faculty", back_populates="kafedras")

    teachers: Mapped[list["Teacher"]] = relationship("Teacher", back_populates="kafedra")
    specialities: Mapped[list["Speciality"]] = relationship("Speciality", back_populates="kafedra")

    def __str__(self):
        return self.name


class Group(Base, IdIntPk, TimestampMixin, ExternalRefMixin):
    __tablename__ = "groups"
    __table_args__ = (
        UniqueConstraint("faculty_id", "name", name="uq_groups_faculty_id_name"),
        external_ref_index("groups"),
    )

    faculty_id: Mapped[int] = mapped_column(ForeignKey("faculties.id"))
    speciality_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("specialities.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(255))

    # Приезжают из EPOS, у групп, заведённых вручную, остаются пустыми.
    course: Mapped[int | None] = mapped_column(Integer, nullable=True)
    education_shape: Mapped[str | None] = mapped_column(String(32), nullable=True)
    student_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    faculty: Mapped["Faculty"] = relationship("Faculty", back_populates="groups")
    speciality: Mapped["Speciality | None"] = relationship("Speciality", back_populates="groups")
    students: Mapped[list["Student"]] = relationship("Student", back_populates="group")

    quizzes: Mapped[list["Quiz"]] = relationship("Quiz", back_populates="group")

    results: Mapped[list["Result"]] = relationship("Result", back_populates="group")

    teacher_groups: Mapped[list["TeacherGroup"]] = relationship(
        "TeacherGroup", back_populates="group", cascade="all, delete-orphan"
    )

    def __str__(self):
        return self.name


class TeacherGroup(Base, IdIntPk, TimestampMixin, ExternalRefMixin):
    __tablename__ = "teacher_group"
    __table_args__ = (
        UniqueConstraint("teacher_id", "group_id", name="uq_teacher_group"),
        external_ref_index("teacher_group"),
    )

    teacher_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    group_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("groups.id", ondelete="CASCADE"), nullable=False, index=True
    )

    teacher: Mapped["Teacher"] = relationship("Teacher", back_populates="teacher_groups")
    group: Mapped["Group"] = relationship("Group", back_populates="teacher_groups")

    def __str__(self):
        return f"TeacherGroup teacher={self.teacher_id} group={self.group_id}"


class Speciality(Base, IdIntPk, TimestampMixin, ExternalRefMixin):
    __tablename__ = "specialities"
    __table_args__ = (
        UniqueConstraint("kafedra_id", "name", name="uq_specialities_kafedra_id_name"),
        external_ref_index("specialities"),
    )

    kafedra_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("kafedras.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    # EPOS EducationType: Bakalavr | Magistr
    education_type: Mapped[str | None] = mapped_column(String(32), nullable=True)

    kafedra: Mapped["Kafedra"] = relationship("Kafedra", back_populates="specialities")
    groups: Mapped[list["Group"]] = relationship("Group", back_populates="speciality")

    def __str__(self):
        return self.name
