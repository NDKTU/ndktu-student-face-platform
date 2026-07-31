"""Shared Pydantic building blocks used across response schemas."""

from datetime import datetime, timedelta, timezone
from typing import Annotated

from pydantic import PlainSerializer

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


# Потолок для `limit` во всех списочных запросах.
#
# Раньше верхней границы не было нигде: `?limit=100000000` возвращал 200 и
# заставлял сервер материализовать всю таблицу вместе с eager-загрузками. Любая
# аутентифицированная учётка могла так исчерпать пул соединений и память
# воркера — без всякого инструментария, одной опечаткой в клиенте.
#
# 1000, а не 200 (шаг, которым листает `getAll` на фронтенде): выгрузка рейтинга
# в CSV запрашивает 1000 одним запросом, и меньший потолок сломал бы её.
MAX_PAGE_SIZE = 1000


def normalized_name(value: str) -> str:
    """Схлопывает пробелы и переводит в нижний регистр.

    База хранит каноническую форму, красивое написание рисует фронтенд
    (`shared/lib/displayName.ts`). Так одному и тому же правилу подчиняются и
    проверка уникальности, и импорт из HEMIS, и то, что ввели руками, — а
    «Konchilik», «KONCHILIK» и «konchilik  » перестают быть тремя разными
    факультетами.
    """
    return " ".join(value.split()).lower()
