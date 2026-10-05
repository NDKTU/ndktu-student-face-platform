"""Talaba oʻz psixologik natijalarini koʻradi — faqat oʻzinikini.

Natijalar endpointi talabaga ruxsat berildi (`read:psychology_results`),
chunki usiz talaba oʻzi topshirgan testning natijasini koʻra olmasdi.

Bu yerda tekshiriladigan narsa — chegara: psixologik natija shaxsiy
maʼlumot, va ruxsat berilgach talaba boshqasinikini soʻrab ololmasligi
kerak. Bekend `user_id` parametrini talabaga majburan oʻzinikiga
almashtiradi (`psychology/router.py::list_results`).
"""

import pytest
import pytest_asyncio

from app.modules.psychology.model import PsychologyMethod, PsychologyResult


async def _make_user(async_db, username: str, role_name: str, permissions: tuple[str, ...]) -> dict:
    from sqlalchemy import select

    from core.utils.password_hash import hash_password

    from app.modules.auth.model import Permission, Role, RolePermission, User, UserRole

    role = Role(name=role_name)
    async_db.add(role)
    await async_db.flush()
    for name in permissions:
        permission = (
            await async_db.execute(select(Permission).where(Permission.name == name))
        ).scalar_one_or_none()
        if permission is None:
            permission = Permission(name=name)
            async_db.add(permission)
            await async_db.flush()
        async_db.add(RolePermission(role_id=role.id, permission_id=permission.id))

    user = User(username=username, password=hash_password("password123"), is_active=True)
    async_db.add(user)
    await async_db.flush()
    async_db.add(UserRole(user_id=user.id, role_id=role.id))
    await async_db.commit()
    return {"id": user.id, "username": username}


@pytest_asyncio.fixture
async def two_students(async_client, async_db):
    """Ikki talaba, har birida bitta topshirilgan test."""
    perms = ("read:psychology", "read:psychology_results")
    first = await _make_user(async_db, "psy_student_a", "student", perms)
    # Ikkinchisiga alohida rol: bitta rolga ikki marta bogʻlash shart emas.
    second = await _make_user(async_db, "psy_student_b", "student_b", perms)

    method = PsychologyMethod(name="Sinov metodi", description="izoh")
    async_db.add(method)
    await async_db.commit()
    await async_db.refresh(method)

    async_db.add_all(
        [
            PsychologyResult(
                method_id=method.id,
                user_id=first["id"],
                answers=[{"question_id": 1, "value": 1}],
                diagnosis={"label": "Past"},
            ),
            PsychologyResult(
                method_id=method.id,
                user_id=second["id"],
                answers=[{"question_id": 1, "value": 5}],
                diagnosis={"label": "Yuqori"},
            ),
        ]
    )
    await async_db.commit()

    async def login(username: str) -> str:
        response = await async_client.post(
            "/user/login", json={"username": username, "password": "password123"}
        )
        assert response.status_code == 200, response.text
        return response.json()["access_token"]

    return {
        "client": async_client,
        "first": first,
        "second": second,
        "token_first": await login("psy_student_a"),
        "method_id": method.id,
    }


def _as(client, token: str):
    client.headers.update({"Authorization": f"Bearer {token}"})
    return client


@pytest.mark.asyncio
async def test_student_sees_own_result(two_students):
    """Oʻz natijasi roʻyxatda bor."""
    client = _as(two_students["client"], two_students["token_first"])

    response = await client.get("/psychology/test/results/", params={"limit": 50})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 1
    assert body["results"][0]["user_id"] == two_students["first"]["id"]
    assert body["results"][0]["diagnosis"]["label"] == "Past"


@pytest.mark.asyncio
async def test_student_cannot_request_another_students_results(two_students):
    """`user_id` ni qoʻlda berib boshqasinikini olib boʻlmaydi.

    Psixologik natija shaxsiy maʼlumot: parametr eʼtiborga olinmay,
    har doim soʻrovchining oʻz natijalari qaytadi.
    """
    client = _as(two_students["client"], two_students["token_first"])

    response = await client.get(
        "/psychology/test/results/",
        params={"user_id": two_students["second"]["id"], "limit": 50},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 1
    assert body["results"][0]["user_id"] == two_students["first"]["id"]


@pytest.mark.asyncio
async def test_admin_sees_all_results(auth_client, two_students):
    """Maʼmuriyat hammasini koʻradi — unga umumiy manzara kerak."""
    response = await auth_client.get("/psychology/test/results/", params={"limit": 50})

    assert response.status_code == 200, response.text
    assert response.json()["total"] == 2
