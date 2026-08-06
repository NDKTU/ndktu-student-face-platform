from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.employee.model import Employee


class JobTitle(Base, IdIntPk, TimestampMixin):
    """Справочник должностей: «Professor», «Dotsent», «Buxgalter».

    Раньше это была строка `Employee.position_title` — свободный текст, который
    каждый раз вводили заново, так что «Katta o'qituvchi» и «Katta oqituvchi»
    оказывались разными должностями и по ним нельзя было ни отфильтровать,
    ни посчитать.

    Называется job_titles, а не positions: слово `position` в проекте уже занято
    — в семи моделях так называется порядковый номер в интерфейсе.
    """

    __tablename__ = "job_titles"

    name: Mapped[str] = mapped_column(String(128), unique=True)

    employees: Mapped[list["Employee"]] = relationship("Employee", back_populates="job_title")

    def __str__(self):
        return self.name
