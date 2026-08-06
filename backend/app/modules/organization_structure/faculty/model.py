from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.organization_structure.kafedra.model import Kafedra


class Faculty(Base, IdIntPk, TimestampMixin):
    __tablename__ = "faculties"
    name: Mapped[str] = mapped_column(String(50), unique=True)

    # Короткий код факультета. Приходит из HEMIS (`faculty.code`, например
    # «319-111») и служит стабильным идентификатором в отчётах: название
    # длинное и меняется, код — нет.
    code: Mapped[str | None] = mapped_column(String(16), nullable=True)

    # Декан — ссылка на employees, а не на users. На users ссылаться нельзя:
    # учётка есть и у студента, и у админа, так что деканом можно было
    # назначить кого угодно, а имя оттуда всё равно не достать — оно живёт
    # в employees. Отдельной подписи рядом больше нет: имя берётся join'ом,
    # и переименование сотрудника сразу видно в карточке.
    #
    # unique: один человек не может быть деканом двух факультетов. Пересечение
    # «декан и заодно заведующий кафедрой» одним UNIQUE не выражается —
    # его по-прежнему ловит available_post в employee/repository.py.
    dekan_employee_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
        index=True,
    )

    # Цвет карточки факультета в дереве структуры. Задаётся вручную:
    # вычислять его из названия значило бы менять оформление при переименовании.
    color_bg: Mapped[str | None] = mapped_column(String(9), nullable=True)
    color_fg: Mapped[str | None] = mapped_column(String(9), nullable=True)

    # Порядок в интерфейсе. Сортировка по created_at ставила бы новые записи
    # в конец без возможности их переставить.
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    def __str__(self):
        return self.name

    # Группы к факультету напрямую больше не привязаны — путь к ним лежит
    # через kafedras → specialities → groups, и он единственный.
    kafedras: Mapped[list["Kafedra"]] = relationship("Kafedra", back_populates="faculty")
