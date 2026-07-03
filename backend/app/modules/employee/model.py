from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.teacher.model import Teacher
    from app.modules.user.models.user import User


class Employee(Base, IdIntPk, TimestampMixin):
    __tablename__ = "employees"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)

    last_name: Mapped[str] = mapped_column(String(255))
    first_name: Mapped[str] = mapped_column(String(255))
    third_name: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(500), unique=True)

    phone_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(255), nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="employee")
    teacher: Mapped["Teacher"] = relationship("Teacher", back_populates="employee", uselist=False)

    def __str__(self):
        return self.full_name
