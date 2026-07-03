from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.employee.model import Employee
    from app.modules.kafedra.model import Kafedra
    from app.modules.subject.models.subject_teacher import SubjectTeacher


class Teacher(Base, IdIntPk, TimestampMixin):
    __tablename__ = "teachers"
    kafedra_id: Mapped[int] = mapped_column(ForeignKey("kafedras.id"))
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), unique=True)

    kafedra: Mapped["Kafedra"] = relationship("Kafedra", back_populates="teachers")

    subject_teachers: Mapped[list["SubjectTeacher"]] = relationship(
        "SubjectTeacher",
        back_populates="teacher",
    )

    employee: Mapped["Employee"] = relationship("Employee", back_populates="teacher")

    def __str__(self):
        return self.employee.full_name if self.employee else f"Teacher {self.id}"
