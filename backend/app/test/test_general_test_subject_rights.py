"""Elementar fan — maʼmuriyatda, savollar banki — oʻqituvchida.

Qaror: oʻqituvchi fanni KOʻRADI, lekin uni tuzmaydi, nomini
oʻzgartirmaydi va oʻchirmaydi. Fan ichidagi ishi esa oʻzgarmaydi —
savol qoʻshadi, Excel yuklaydi, tahrirlaydi.

Buni bitta huquq bilan ifodalab boʻlmasdi: `update:general_test_subject`
fanni tahrirlashni ham, savol qoʻshishni ham yopib turardi, yaʼni
ikkinchisini birinchisisiz berib boʻlmasdi. Shu sababli savollar banki
alohida huquqlarga ajratildi.

Shuning uchun bu yerda ROʻYXAT emas, xulqning oʻzi tekshiriladi:
roʻyxatdagi satrni kelajakda kimdir oʻzgartirsa, test yiqilib, qaror
esga tushsin.
"""

import pytest
import pytest_asyncio

from app.core.lifespan.defaults import TEACHER_PERMISSIONS

QUESTION = {
    "text": "2 + 2?",
    "option_a": "4",
    "option_b": "3",
    "option_c": "5",
    "option_d": "6",
    "correct_option": "a",
}


async def _make_user(async_db, username: str, role_name: str, permissions) -> dict:
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
async def teacher(async_client, async_db, auth_client, access_token):
    """Ishlab turgan huquqlar bilan oʻqituvchi va maʼmuriyat ochgan fan.

    Huquqlar roʻyxati `defaults.py` dan OLINADI, qoʻlda sanalmaydi:
    aks holda test boshqa haqiqatni tekshirib qolardi.
    """
    person = await _make_user(async_db, "gt_real_teacher", "teacher_real", TEACHER_PERMISSIONS)

    auth_client.headers.update({"Authorization": f"Bearer {access_token}"})
    created = await auth_client.post("/general-test/subject", json={"name": "Maʼmuriyat fani"})
    assert created.status_code == 201, created.text
    subject_id = created.json()["id"]

    login = await async_client.post(
        "/user/login", json={"username": "gt_real_teacher", "password": "password123"}
    )
    assert login.status_code == 200, login.text
    async_client.headers.update({"Authorization": f"Bearer {login.json()['access_token']}"})
    return {"client": async_client, "subject_id": subject_id, "id": person["id"]}


@pytest.mark.asyncio
async def test_teacher_cannot_create_a_subject(teacher):
    """Fan tuzish — maʼmuriyatda."""
    response = await teacher["client"].post("/general-test/subject", json={"name": "Oʻzim"})

    assert response.status_code == 403, response.text


@pytest.mark.asyncio
async def test_teacher_cannot_rename_or_delete_a_subject(teacher):
    """Nomini oʻzgartirish va oʻchirish ham."""
    client, subject_id = teacher["client"], teacher["subject_id"]

    renamed = await client.put(f"/general-test/subject/{subject_id}", json={"name": "Boshqa nom"})
    removed = await client.delete(f"/general-test/subject/{subject_id}")

    assert renamed.status_code == 403, renamed.text
    assert removed.status_code == 403, removed.text


@pytest.mark.asyncio
async def test_teacher_cannot_change_who_is_assigned(teacher):
    """Fanga kim biriktirilganini ham oʻqituvchi hal qilmaydi."""
    client, subject_id = teacher["client"], teacher["subject_id"]

    response = await client.post(
        f"/general-test/subject/{subject_id}/users", json={"user_ids": [teacher["id"]]}
    )

    assert response.status_code == 403, response.text


@pytest.mark.asyncio
async def test_teacher_still_sees_subjects(teacher):
    """Koʻrish qoladi — aks holda u oʻz testini qaysi fanga tuzishini bilmasdi."""
    response = await teacher["client"].get("/general-test/subject", params={"limit": 50})

    assert response.status_code == 200, response.text


@pytest.mark.asyncio
async def test_teacher_still_uploads_questions(teacher, async_db):
    """Asosiy regressiya: savol qoʻshish fan huquqi bilan birga ketmasin.

    Fan huquqlari olib tashlanganda savollar banki ham yopilib qolgan
    boʻlardi — ikkalasi bitta huquq ostida edi.
    """
    from app.modules.general_test.model import GeneralTestSubjectUser

    client, subject_id = teacher["client"], teacher["subject_id"]
    # Fanga biriktirilgan: begona fanning bankiga kirish egalik bilan
    # tekshiriladi, bu huquqdan alohida chegara.
    async_db.add(GeneralTestSubjectUser(subject_id=subject_id, user_id=teacher["id"]))
    await async_db.commit()

    added = await client.post(f"/general-test/subject/{subject_id}/question", json=QUESTION)

    assert added.status_code in (200, 201), added.text


@pytest.mark.asyncio
async def test_subject_rights_are_not_in_the_teacher_list():
    """Roʻyxat oʻzi ham qaror: fan huquqlari u yerga qaytib kelmasin."""
    assert "create:general_test_subject" not in TEACHER_PERMISSIONS
    assert "update:general_test_subject" not in TEACHER_PERMISSIONS
    assert "delete:general_test_subject" not in TEACHER_PERMISSIONS
    assert "read:general_test_subject" in TEACHER_PERMISSIONS
    assert "create:general_test_question" in TEACHER_PERMISSIONS
