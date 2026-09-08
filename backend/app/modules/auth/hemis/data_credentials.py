"""Откуда берётся токен административного API HEMIS.

Приоритет: строка в ``hemis_data_credentials`` (введена администратором) →
``APP_CONFIG__HEMIS__DATA_TOKEN``. Токен протухает, поэтому основной путь —
форма в интерфейсе: правка ``.env`` с перезапуском backend для регулярной
операции не годится.
"""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.mixins.time_stamp_mixin import utcnow_naive
from app.core.utils.secret_box import SecretUnreadable, decrypt_secret, encrypt_secret

from .model import HemisDataCredential
from .schemas import HemisDataSettingsIn, HemisDataSettingsOut

logger = logging.getLogger(__name__)


async def load_row(session: AsyncSession) -> HemisDataCredential | None:
    result = await session.execute(
        select(HemisDataCredential).order_by(HemisDataCredential.id.desc()).limit(1)
    )
    return result.scalars().first()


async def effective(session: AsyncSession) -> tuple[str, str]:
    """(url, token), с которыми реально пойдёт запрос."""
    row = await load_row(session)
    # Строка без своего токена — служебная: её заводит `ensure_row` ради
    # отметок о прогонах. Приоритет окружения она не отбирает.
    if row is None or not row.token_encrypted:
        url = (row.data_url if row and row.data_url else settings.hemis.data_url)
        return url, settings.hemis.data_token

    try:
        token = decrypt_secret(row.token_encrypted)
    except SecretUnreadable:
        # Ключ шифрования сменился: сохранённый токен бесполезен. Не выдаём
        # это за «HEMIS отклонил токен» — админ должен ввести его заново.
        logger.warning("HEMIS: сохранённый токен не расшифровывается, нужен повторный ввод")
        token = ""
    return row.data_url or settings.hemis.data_url, token


def _tail(token: str) -> str:
    """Хвост токена — чтобы админ отличил один ключ от другого."""
    return f"…{token[-4:]}" if len(token) > 4 else ""


async def masked(session: AsyncSession) -> HemisDataSettingsOut:
    row = await load_row(session)
    if row is None or not row.token_encrypted:
        env_token = settings.hemis.data_token
        return HemisDataSettingsOut(
            source="env",
            data_url=(row.data_url if row and row.data_url else settings.hemis.data_url),
            has_token=bool(env_token),
            token_tail=_tail(env_token),
            last_ok_at=row.last_ok_at if row else None,
            updated_at=row.updated_at if row else None,
        )

    url, token = await effective(session)
    return HemisDataSettingsOut(
        source="db",
        data_url=url,
        has_token=bool(token),
        token_tail=_tail(token),
        last_ok_at=row.last_ok_at,
        updated_at=row.updated_at,
    )


async def upsert(
    session: AsyncSession, data: HemisDataSettingsIn, user_id: int | None
) -> HemisDataCredential:
    row = await ensure_row(session)
    if data.data_url:
        row.data_url = data.data_url
    # Пустой токен — «не менять»: форма не показывает текущий и не должна
    # затирать его пустой отправкой.
    if data.token:
        row.token_encrypted = encrypt_secret(data.token)
        row.last_ok_at = None
    row.updated_by_user_id = user_id

    await session.commit()
    await session.refresh(row)
    return row


async def ensure_row(session: AsyncSession) -> HemisDataCredential:
    """Строка настроек; заводит пустую, если админ ничего не вводил.

    Нужна не ради самого токена, а ради отметок рядом с ним: `last_ok_at` и
    `last_student_sync_at` хранятся здесь же. Пока строки не было, ночному
    прогону некуда было записать окно инкремента — и каждый запуск с
    `--incremental` молча обходил все 49 страниц заново.
    """
    row = await load_row(session)
    if row is not None:
        return row

    # Токен сюда не копируем: он остался бы снимком окружения на момент
    # первого прогона и молча пережил бы правку `.env`. Пустое поле означает
    # «смотри в окружение», см. `effective`.
    row = HemisDataCredential(data_url=settings.hemis.data_url, token_encrypted="")
    session.add(row)
    await session.flush()
    return row


async def mark_ok(session: AsyncSession) -> None:
    """Отмечает удачный запрос: по этой дате видно, живой ли токен."""
    row = await ensure_row(session)
    row.last_ok_at = utcnow_naive()
    await session.commit()
