"""Откуда клиент EduPlan берёт учётные данные.

Приоритет: строка в ``eduplan_credentials`` (введена администратором в
интерфейсе) → переменные ``APP_CONFIG__EDUPLAN__*``. Пароль EduPlan меняется
часто, и каждый раз править ``.env`` на сервере и перезапускать backend —
плохой процесс; форма в интерфейсе закрывает это.
"""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import EduPlanConfig, settings
from app.core.utils.secret_box import SecretUnreadable, decrypt_secret, encrypt_secret

from .model import EduPlanCredential
from .schemas import EduPlanSettingsIn, EduPlanSettingsOut

logger = logging.getLogger(__name__)


async def load_row(session: AsyncSession) -> EduPlanCredential | None:
    result = await session.execute(select(EduPlanCredential).order_by(EduPlanCredential.id.desc()).limit(1))
    return result.scalars().first()


async def effective_config(session: AsyncSession) -> EduPlanConfig:
    """Конфигурация, с которой реально пойдёт запрос к EduPlan."""
    base = settings.eduplan
    row = await load_row(session)
    if row is None:
        return base
    try:
        password = decrypt_secret(row.password_encrypted)
    except SecretUnreadable:
        # Ключ сменился: сохранённый пароль бесполезен. Не маскируем это под
        # «неверный пароль» — администратор должен ввести его заново.
        logger.warning("EduPlan: сохранённый пароль не расшифровывается, нужен повторный ввод")
        password = ""
    return base.model_copy(
        update={
            "enabled": True,
            "base_url": row.base_url or base.base_url,
            "username": row.username,
            "password": password,
            "active_role": row.active_role,
        }
    )


async def masked_settings(session: AsyncSession) -> EduPlanSettingsOut:
    """То, что можно показать в интерфейсе: всё, кроме самого пароля."""
    row = await load_row(session)
    if row is None:
        env = settings.eduplan
        return EduPlanSettingsOut(
            source="env",
            base_url=env.base_url,
            username=env.username,
            active_role=env.active_role,
            has_password=bool(env.password),
            enabled=env.enabled,
            updated_at=None,
        )
    password_ok = True
    try:
        decrypt_secret(row.password_encrypted)
    except SecretUnreadable:
        password_ok = False
    return EduPlanSettingsOut(
        source="db",
        base_url=row.base_url,
        username=row.username,
        active_role=row.active_role,
        has_password=password_ok,
        enabled=True,
        updated_at=row.updated_at,
    )


async def upsert(session: AsyncSession, data: EduPlanSettingsIn, user_id: int | None) -> EduPlanCredential:
    row = await load_row(session)
    if row is None:
        if not data.password:
            raise ValueError("Parol kiritilishi shart")
        row = EduPlanCredential(
            base_url=data.base_url or settings.eduplan.base_url,
            username=data.username,
            password_encrypted=encrypt_secret(data.password),
            active_role=data.active_role or "",
            updated_by_user_id=user_id,
        )
        session.add(row)
    else:
        row.base_url = data.base_url or row.base_url
        row.username = data.username
        row.active_role = data.active_role or ""
        row.updated_by_user_id = user_id
        # Пустой пароль в форме значит «оставить прежний» — иначе админу
        # пришлось бы вводить его при каждой правке роли или адреса.
        if data.password:
            row.password_encrypted = encrypt_secret(data.password)
    await session.commit()
    await session.refresh(row)
    return row


async def clear(session: AsyncSession) -> bool:
    row = await load_row(session)
    if row is None:
        return False
    await session.delete(row)
    await session.commit()
    return True
