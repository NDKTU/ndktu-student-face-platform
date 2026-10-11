"""«Zoom akkauntlar» sahifasi: akkauntlarni qo'shish, tahrirlash, tekshirish.

Sirlar shifrlangan holda saqlanadi va javobda qaytmaydi — faqat bor-yo'qligi.
Tahrirda bo'sh sir «o'zgarmasin» degani: admin har safar barcha sirlarni
qayta kiritishi shart emas.
"""

from fastapi import status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utils.secret_box import encrypt_secret
from app.modules.quiz.quiz_process.errors import quiz_error

from .accounts import ENV_ACCOUNT_ID, ZoomCredentials, credentials_by_id, credentials_of, env_credentials
from .model import ZoomAccount, ZoomSession
from .schemas import (
    ZoomAccountCheckResponse,
    ZoomAccountListResponse,
    ZoomAccountRequest,
    ZoomAccountResponse,
)
from .zoom_api import ZoomApiError, zoom_api

#: Zoom foydalanuvchi turi: 2 — litsenziyali (Licensed).
LICENSED_USER_TYPE = 2


def _not_found():
    return quiz_error(status.HTTP_404_NOT_FOUND, "zoom_account_not_found", "Zoom akkaunti topilmadi")


def _env_readonly():
    return quiz_error(
        status.HTTP_409_CONFLICT,
        "zoom_account_env_readonly",
        "Bu akkaunt .env faylidan olinadi — uni serverdagi .env da o'zgartiring",
    )


def _duplicate_name():
    return quiz_error(status.HTTP_409_CONFLICT, "zoom_account_name_taken", "Bu nomli akkaunt allaqachon bor")


def _in_use(count: int):
    return quiz_error(
        status.HTTP_409_CONFLICT,
        "zoom_account_in_use",
        f"Akkauntga {count} ta seans bog'langan — o'chirish o'rniga uni faolsizlantiring",
        sessions=count,
    )


def _incomplete_api():
    return quiz_error(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "zoom_account_incomplete_api",
        "Zoom API uchun Account ID, Client ID, Client Secret va host email to'rttasi ham kerak "
        "(yoki to'rttasini ham bo'sh qoldiring)",
    )


def _sdk_secret_required():
    return quiz_error(
        status.HTTP_422_UNPROCESSABLE_CONTENT, "zoom_account_sdk_secret_required", "Meeting SDK Client Secret kerak"
    )


def _response(creds: ZoomCredentials, *, is_active: bool, sessions_count: int) -> ZoomAccountResponse:
    return ZoomAccountResponse(
        id=creds.id or ENV_ACCOUNT_ID,
        name=creds.name,
        host_email=creds.host_user or None,
        api_account_id=creds.api_account_id or None,
        api_client_id=creds.api_client_id or None,
        sdk_key=creds.sdk_key or None,
        has_api_secret=bool(creds.api_client_secret),
        has_sdk_secret=bool(creds.sdk_secret),
        has_webhook_secret=bool(creds.webhook_secret),
        is_active=is_active,
        from_env=creds.id is None,
        api_enabled=creds.api_enabled,
        sdk_enabled=creds.sdk_enabled,
        sessions_count=sessions_count,
    )


async def _sessions_count(session: AsyncSession, account_id: int | None) -> int:
    condition = ZoomSession.zoom_account_id == account_id if account_id else ZoomSession.zoom_account_id.is_(None)
    return (await session.execute(select(func.count(ZoomSession.id)).where(condition))).scalar_one()


async def list_accounts(session: AsyncSession) -> ZoomAccountListResponse:
    rows = (await session.execute(select(ZoomAccount).order_by(ZoomAccount.id))).scalars().all()
    accounts = [
        _response(credentials_of(row), is_active=row.is_active, sessions_count=await _sessions_count(session, row.id))
        for row in rows
    ]
    env = env_credentials()
    if env.sdk_enabled or env.api_enabled:
        accounts.insert(0, _response(env, is_active=True, sessions_count=await _sessions_count(session, None)))
    return ZoomAccountListResponse(accounts=accounts)


async def _get(session: AsyncSession, account_id: int) -> ZoomAccount:
    if account_id == ENV_ACCOUNT_ID:
        raise _env_readonly()
    row = await session.get(ZoomAccount, account_id)
    if row is None:
        raise _not_found()
    return row


async def _ensure_unique_name(session: AsyncSession, name: str, exclude_id: int | None = None) -> None:
    stmt = select(ZoomAccount.id).where(func.lower(ZoomAccount.name) == name.lower())
    if exclude_id is not None:
        stmt = stmt.where(ZoomAccount.id != exclude_id)
    if (await session.execute(stmt)).first() is not None:
        raise _duplicate_name()


def _apply(row: ZoomAccount, data: ZoomAccountRequest) -> None:
    row.name = data.name
    row.host_email = data.host_email
    row.api_account_id = data.api_account_id
    row.api_client_id = data.api_client_id
    row.sdk_key = data.sdk_key
    row.is_active = data.is_active
    if data.api_client_secret:
        row.api_client_secret_encrypted = encrypt_secret(data.api_client_secret)
    if data.sdk_secret:
        row.sdk_secret_encrypted = encrypt_secret(data.sdk_secret)
    if data.webhook_secret_token:
        row.webhook_secret_encrypted = encrypt_secret(data.webhook_secret_token)
    # API qismi yo to'liq, yo umuman yo'q: yarim sozlangan akkaunt avtomatik
    # tanlovda «API bor» deb ko'rinmaydi, lekin admin buni sezmay qolardi.
    # Account ID va Client ID ikkalasi bo'sh — API o'chirildi, saqlangan sir ham ketadi.
    if not (data.api_account_id or data.api_client_id or data.api_client_secret):
        row.api_client_secret_encrypted = None
    elif not (row.api_account_id and row.api_client_id and row.api_client_secret_encrypted and row.host_email):
        raise _incomplete_api()


async def create_account(session: AsyncSession, data: ZoomAccountRequest) -> ZoomAccountResponse:
    if not data.sdk_secret:
        raise _sdk_secret_required()
    await _ensure_unique_name(session, data.name)
    row = ZoomAccount()
    _apply(row, data)
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _response(credentials_of(row), is_active=row.is_active, sessions_count=0)


async def update_account(session: AsyncSession, account_id: int, data: ZoomAccountRequest) -> ZoomAccountResponse:
    row = await _get(session, account_id)
    await _ensure_unique_name(session, data.name, exclude_id=row.id)
    _apply(row, data)
    await session.commit()
    await session.refresh(row)
    count = await _sessions_count(session, row.id)
    return _response(credentials_of(row), is_active=row.is_active, sessions_count=count)


async def delete_account(session: AsyncSession, account_id: int) -> None:
    row = await _get(session, account_id)
    count = await _sessions_count(session, row.id)
    if count:
        raise _in_use(count)
    await session.delete(row)
    await session.commit()


async def check_account(session: AsyncSession, account_id: int) -> ZoomAccountCheckResponse:
    """Kalit ishlaydimi: token olinadi va host so'raladi. SDK kalitini serverdan
    tekshirib bo'lmaydi — u faqat brauzerdagi kirishda sinaladi."""
    creds = await credentials_by_id(session, account_id or None)
    if creds is None:
        raise _not_found()
    result = ZoomAccountCheckResponse(sdk_configured=creds.sdk_enabled, host_email=creds.host_user or None)
    if not creds.api_enabled:
        return result
    try:
        host = await zoom_api.get_user(creds, creds.host_user)
    except ZoomApiError as cause:
        result.api_ok = False
        result.api_message = cause.message
        return result
    result.api_ok = True
    result.host_licensed = host.get("type") == LICENSED_USER_TYPE
    if not result.host_licensed:
        result.api_message = "Host litsenziyasiz (Basic): ro'yxatdan o'tish va 40 daqiqadan uzun uchrashuv ishlamaydi"
    return result
