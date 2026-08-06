from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.employee.model import Employee


class Department(Base, IdIntPk, TimestampMixin):
    __tablename__ = "departments"

    name: Mapped[str] = mapped_column(String(255), unique=True)

    employees: Mapped[list["Employee"]] = relationship("Employee", back_populates="department")

    def __str__(self):
        return self.name
