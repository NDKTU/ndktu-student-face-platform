"""Служебные поля для таблиц-зеркал внешних систем (EduPlan/EPOS, Hemis).

Строка справочника может быть заведена вручную (``external_source IS NULL``)
либо приехать из внешней системы. Синхронизация трогает только вторые: для
первых она не источник истины и затирать их не имеет права.

Удаления зеркало не делает никогда — на факультетах, группах и предметах висят
результаты тестов и вопросы, поэтому исчезнувшая во внешней системе строка
переводится в ``is_active = False``, а не удаляется.
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

# Допустимые значения external_source. Строкой, а не Enum: добавление нового
# источника не должно требовать миграции типа в Postgres.
SOURCE_EDUPLAN = "eduplan"
SOURCE_HEMIS = "hemis"


class ExternalRefMixin:
    """Привязка строки к её оригиналу во внешней системе."""

    external_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    external_source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("true"),
        default=True,
    )

    @property
    def is_external(self) -> bool:
        """True, если строкой владеет внешняя система и править её руками нельзя."""
        return self.external_source is not None


def external_ref_index(table_name: str) -> Index:
    """Частичный уникальный индекс по (external_source, external_id).

    Именно он делает синхронизацию идемпотентной: повторный прогон обновляет
    существующую строку, а не создаёт вторую. Частичный — потому что строк с
    ``external_id IS NULL`` (заведённых вручную) в таблице сколько угодно, и
    обычный UNIQUE их бы не пропустил.
    """
    return Index(
        f"uq_{table_name}_external_ref",
        "external_source",
        "external_id",
        unique=True,
        postgresql_where=text("external_id IS NOT NULL"),
    )
