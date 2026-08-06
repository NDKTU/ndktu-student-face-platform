from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.organization_structure.curriculum.model import Curriculum
    from app.modules.organization_structure.group.model import Group
    from app.modules.organization_structure.kafedra.model import Kafedra


class Speciality(Base, IdIntPk, TimestampMixin):
    __tablename__ = "specialities"

    kafedra_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("kafedras.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)

    # Код направления по классификатору («60610100»).
    code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # Формы обучения здесь нет: name UNIQUE, и одно направление не может
    # существовать сразу как кундузги и как сиртки. Форма живёт на группе.
    # Учебный год плана («2025/2026»), к которому относится curriculum.
    academic_year: Mapped[str | None] = mapped_column(String(16), nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    kafedra: Mapped["Kafedra"] = relationship("Kafedra", back_populates="specialities")
    groups: Mapped[list["Group"]] = relationship("Group", back_populates="speciality")
    curriculum: Mapped[list["Curriculum"]] = relationship(
        "Curriculum",
        back_populates="speciality",
        cascade="all, delete-orphan",
        order_by="Curriculum.semester, Curriculum.position, Curriculum.id",
    )

    def __str__(self):
        return self.name
