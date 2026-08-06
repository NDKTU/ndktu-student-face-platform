from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.teacher.model import Teacher
    from app.modules.organization_structure.faculty.model import Faculty
    from app.modules.organization_structure.speciality.model import Speciality


class Kafedra(Base, IdIntPk, TimestampMixin):
    __tablename__ = "kafedras"

    faculty_id: Mapped[int] = mapped_column(ForeignKey("faculties.id"))
    name: Mapped[str] = mapped_column(String(255), unique=True)

    # Заведующий кафедрой — по той же схеме, что декан у факультета.
    mudir_employee_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    faculty: Mapped["Faculty"] = relationship("Faculty", back_populates="kafedras")

    teachers: Mapped[list["Teacher"]] = relationship("Teacher", back_populates="kafedra")
    specialities: Mapped[list["Speciality"]] = relationship("Speciality", back_populates="kafedra")

    def __str__(self):
        return self.name


# Формы обучения. Sirtqi остаётся в словаре: заочное обучение в вузах
# Узбекистана прекращено, но записи прошлых лет должны читаться. Из выпадающих
# списков его убирает фронтенд, а не база.
#
# Дублируется как Literal в organization_structure/group/schemas.py — менять
# нужно оба места разом. Значение ENUM'а из типа не удалить (PostgreSQL этого
# не умеет), так что новое добавлять можно, а старое — только перестать
# предлагать.
EDUCATION_FORMS = ("Kunduzgi", "Kechki", "Masofaviy", "Sirtqi")

education_form_enum = Enum(*EDUCATION_FORMS, name="education_form")
