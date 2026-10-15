"""Tizim rollari kodidan taniladi, nomidan emas.

Rollar bazada yaratiladi va nomini admin interfeysdan o'zgartira oladi.
Ilgari kod 31 joyda `role.name.lower() == "admin"` bilan tekshirardi,
ikkitasida esa registrga bog'liq `role.name == "Admin"` bilan — rol qayta
nomlansa, `PermissionRequired` adminni tanimay qolardi.
"""

import pathlib
import re

import pytest
from sqlalchemy import select

from app.core.utils.roles import ROLE_ADMIN, role_keys, user_is_admin, user_is_student, user_is_teacher
from app.modules.auth.model import Role

APP_DIR = pathlib.Path(__file__).resolve().parents[1]

#: Rolni nomi bo'yicha tanish — taqiqlangan shakllar.
_FORBIDDEN = re.compile(
    r"""\.name\.lower\(\)\s*(==|in\b)"""
    r"""|\b(role|r)\.name\s*=="""
    r"""|lower\(Role\.name\)\s*==\s*["']"""
    r"""|Role\.name\s*==\s*["'](?i:admin|teacher|student)["']"""
)


def test_no_role_name_checks_in_code():
    """Strajnik: rolni nomidan tanish yangi kodda qaytib kelmasin.

    Tizim roli — `user_is_admin` / `user_has_role` / `role_keys`
    (`core/utils/roles.py`); qolgan rollar xatti-harakati — ruxsat va
    `data_scope` orqali.
    """
    offenders = []
    for path in APP_DIR.rglob("*.py"):
        rel = path.relative_to(APP_DIR)
        if rel.parts[0] in {"test", "migrations"} or path.name == "roles.py":
            continue
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            code = line.split("#", 1)[0]
            if _FORBIDDEN.search(code):
                offenders.append(f"{rel}:{number}: {line.strip()}")
    assert not offenders, "Rol nomidan tanilmoqda:\n" + "\n".join(offenders)


class _Role:
    def __init__(self, name, code=None):
        self.name, self.code = name, code


class _User:
    def __init__(self, *roles):
        self.roles = list(roles)


def test_renamed_system_role_is_still_recognised():
    """Nomi o'zgargan admin ham admin; «admin» nomli oddiy rol — admin emas."""
    assert user_is_admin(_User(_Role("Bosh administrator", "admin")))
    assert not user_is_admin(_User(_Role("admin")))  # interfeysda yaratilgan, kodsiz
    assert user_is_teacher(_User(_Role("O'qituvchi", "teacher")))
    assert user_is_student(_User(_Role("Talaba", "student")))


def test_role_keys_mix_codes_and_names():
    keys = role_keys(_User(_Role("O'qituvchi", "teacher"), _Role(" Psixologik ")))
    assert keys == {"teacher", "psixologik"}


@pytest.mark.asyncio
async def test_seeded_roles_get_code_from_name(async_db):
    """Seed va sinxronizatsiya rolni nom bilan yaratadi — kod nomdan olinadi."""
    async_db.add_all([Role(name="Admin"), Role(name="teacher"), Role(name="watchman")])
    await async_db.commit()

    codes = dict((await async_db.execute(select(Role.name, Role.code))).all())
    assert codes["Admin"] == ROLE_ADMIN
    assert codes["teacher"] == "teacher"
    assert codes["watchman"] is None


@pytest.mark.asyncio
async def test_renamed_admin_still_passes_permission_check(auth_client, async_db):
    """Admin roli qayta nomlansa ham `PermissionRequired` uni o'tkazadi.

    Ilgari bu yerda `role.name == "Admin"` turardi: nom o'zgarsa, admin
    barcha himoyalangan endpointlarda 403 olardi.
    """
    admin = (await async_db.execute(select(Role).where(Role.code == ROLE_ADMIN))).scalar_one()
    admin.name = "Bosh administrator"
    await async_db.commit()

    response = await auth_client.get("/teacher/options")
    assert response.status_code == 200, response.text


@pytest.mark.asyncio
async def test_system_role_cannot_be_deleted_but_custom_can(auth_client, async_db):
    admin = (await async_db.execute(select(Role).where(Role.code == ROLE_ADMIN))).scalar_one()
    assert (await auth_client.delete(f"/role/{admin.id}")).status_code == 400

    created = await auth_client.post("/role/", json={"name": "Student"})
    if created.status_code == 400:  # «Student» bazada bor bo'lsa — boshqa nom
        created = await auth_client.post("/role/", json={"name": "Talaba (test)"})
    assert created.status_code in (200, 201), created.text
    # Interfeysdan yaratilgan rol tizim roli bo'lmaydi, nomi «Student» bo'lsa ham.
    assert created.json()["code"] is None
    assert (await auth_client.delete(f"/role/{created.json()['id']}")).status_code in (200, 204)
