from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.education_plan.model import EducationPlan
    from app.modules.group.models.group import Group
    from app.modules.kafedra.model import Kafedra


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
    education_plans: Mapped[list["EducationPlan"]] = relationship(
        "EducationPlan", back_populates="speciality"
    )
    groups: Mapped[list["Group"]] = relationship("Group", back_populates="speciality")

    def __str__(self):
        return self.name
