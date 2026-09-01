"""Shared Pydantic building blocks used across response schemas."""

from datetime import datetime, timedelta, timezone
from typing import Annotated

from pydantic import BaseModel, PlainSerializer

TASHKENT_TZ = timezone(timedelta(hours=5))


def _to_tashkent_iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    aware = dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    return aware.astimezone(TASHKENT_TZ).isoformat()


# Use on response-schema datetime fields (created_at, updated_at, deadline,
# submitted_at, ...) so API responses always carry Asia/Tashkent (+05:00)
# local time, regardless of the naive-UTC value stored in the DB column.
# Input schemas keep plain `datetime` — clients still send tz-aware UTC.
TashkentDatetime = Annotated[datetime, PlainSerializer(_to_tashkent_iso, return_type=str | None)]


class ExternalRefFields(BaseModel):
    """Признаки строки-зеркала для схем ответа.

    Фронтенду они нужны, чтобы показать, что запись приехала из внешней системы,
    и не предлагать её редактировать: бэкенд такие правки всё равно отклонит.
    """

    external_source: str | None = None
    synced_at: TashkentDatetime | None = None
    is_active: bool = True

    # Admin yashirgan. `is_active` dan alohida: u sinxronizatsiyaniki
    # («manbada hali bormi»), bu esa adminning qarori.
    is_hidden: bool = False


class VisibilityRequest(BaseModel):
    """Spravochnik yozuvini yashirish yoki qaytarish.

    Faqat admin uchun. `is_active` dan farqli — u sinxronizatsiyaniki, bu esa
    adminning qaroridir; ikkalasidan biri yoqilgan boʻlsa yozuv koʻrinmaydi.
    """

    is_hidden: bool
