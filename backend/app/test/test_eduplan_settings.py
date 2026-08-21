"""Учётные данные EduPlan, введённые в интерфейсе.

Проверяем контракт, ради которого заведена таблица: пароль сохраняется
зашифрованным, наружу не отдаётся, пустой пароль в форме оставляет прежний,
а удаление возвращает клиент к переменным окружения.
"""

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.core.utils.secret_box import decrypt_secret, encrypt_secret
from app.modules.auth.model import Permission, RolePermission
from app.modules.integration.eduplan import credentials
from app.modules.integration.eduplan.model import EduPlanCredential

SETTINGS_URL = "/integration/eduplan/settings"


@pytest_asyncio.fixture
async def eduplan_perms(async_db, test_role):
    """Права на чтение/синхронизацию EduPlan для роли тестового пользователя.

    Запрашивать ДО auth_client: права читаются при входе.
    """
    for name in ("read:eduplan", "sync:eduplan"):
        perm = Permission(name=name)
        async_db.add(perm)
        await async_db.flush()
        async_db.add(RolePermission(role_id=test_role.id, permission_id=perm.id))
    await async_db.commit()


def test_secret_box_roundtrip():
    token = encrypt_secret("s3cret-пароль")
    assert token != "s3cret-пароль"
    assert decrypt_secret(token) == "s3cret-пароль"


@pytest.mark.asyncio
async def test_settings_default_come_from_env(eduplan_perms, auth_client):
    response = await auth_client.get(SETTINGS_URL)
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "env"
    assert "password" not in body


@pytest.mark.asyncio
async def test_save_settings_encrypts_password_and_hides_it(eduplan_perms, auth_client, async_db):
    response = await auth_client.put(
        SETTINGS_URL,
        json={"username": "svc", "password": "p@ss", "active_role": "admin"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["source"] == "db"
    assert body["username"] == "svc"
    assert body["has_password"] is True
    assert "password" not in body

    row = (await async_db.execute(select(EduPlanCredential))).scalars().one()
    assert row.password_encrypted != "p@ss"
    assert decrypt_secret(row.password_encrypted) == "p@ss"

    cfg = await credentials.effective_config(async_db)
    assert cfg.enabled is True
    assert cfg.username == "svc"
    assert cfg.password == "p@ss"
    assert cfg.active_role == "admin"


@pytest.mark.asyncio
async def test_empty_password_keeps_previous(eduplan_perms, auth_client, async_db):
    await auth_client.put(SETTINGS_URL, json={"username": "svc", "password": "first", "active_role": ""})
    response = await auth_client.put(SETTINGS_URL, json={"username": "svc2", "password": "", "active_role": "dean"})
    assert response.status_code == 200, response.text

    cfg = await credentials.effective_config(async_db)
    assert cfg.username == "svc2"
    assert cfg.active_role == "dean"
    assert cfg.password == "first"


@pytest.mark.asyncio
async def test_first_save_requires_password(eduplan_perms, auth_client):
    response = await auth_client.put(SETTINGS_URL, json={"username": "svc", "password": "", "active_role": ""})
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_delete_falls_back_to_env(eduplan_perms, auth_client):
    await auth_client.put(SETTINGS_URL, json={"username": "svc", "password": "p", "active_role": ""})
    response = await auth_client.delete(SETTINGS_URL)
    assert response.status_code == 204
    body = (await auth_client.get(SETTINGS_URL)).json()
    assert body["source"] == "env"
