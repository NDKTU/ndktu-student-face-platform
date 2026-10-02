"""Elementar testlarda egalik.

Oʻqituvchi endi oʻz elementar testini tuza oladi. `created_by_user_id`
ilgari ham yozilardi, lekin hech qayerda tekshirilmasdi: roʻyxatlar
hammaniki qaytarardi, tahrirlash va oʻchirish egasiga qaramasdi.
Ruxsatni shundayligicha berish — har bir oʻqituvchiga begona testlarni
va ularning savollar bankini ochib qoʻyish degani edi.

Admin hammasini koʻradi: unga umumiy nazorat kerak.
"""

import pytest
import pytest_asyncio

from app.modules.general_test.model import GeneralTest, GeneralTestQuestion, GeneralTestSubject


async def _make_user(async_db, username: str, role_name: str, permissions: tuple[str, ...]) -> dict:
    from core.utils.password_hash import hash_password

    from app.modules.auth.model import Permission, Role, RolePermission, User, UserRole

    role = Role(name=role_name)
    async_db.add(role)
    await async_db.flush()
    for name in permissions:
        permission = (
            await async_db.execute(
                __import__("sqlalchemy").select(Permission).where(Permission.name == name)
            )
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


TEACHER_PERMS = (
    "read:general_test_subject",
    "create:general_test_subject",
    "update:general_test_subject",
    "delete:general_test_subject",
    "read:general_test",
    "create:general_test",
    "update:general_test",
    "delete:general_test",
    "read:general_test_result",
)


@pytest_asyncio.fixture
async def two_teachers(async_client, async_db):
    """Ikki oʻqituvchi va ularning mijozlari."""
    first = await _make_user(async_db, "gt_teacher_a", "teacher_a", TEACHER_PERMS)
    second = await _make_user(async_db, "gt_teacher_b", "teacher_b", TEACHER_PERMS)

    async def login(username: str) -> str:
        response = await async_client.post(
            "/user/login", json={"username": username, "password": "password123"}
        )
        assert response.status_code == 200, response.text
        return response.json()["access_token"]

    return {
        "first": first,
        "second": second,
        "token_first": await login("gt_teacher_a"),
        "token_second": await login("gt_teacher_b"),
        "client": async_client,
    }


def _as(client, token: str):
    client.headers.update({"Authorization": f"Bearer {token}"})
    return client


@pytest.mark.asyncio
async def test_teacher_can_create_subject_and_upload_question(two_teachers):
    """Oʻqituvchi oʻz fanini ochib, unga savol qoʻsha oladi."""
    client = _as(two_teachers["client"], two_teachers["token_first"])

    created = await client.post("/general-test/subject", json={"name": "Oʻqituvchi fani"})
    assert created.status_code == 201, created.text
    subject_id = created.json()["id"]

    question = await client.post(
        f"/general-test/subject/{subject_id}/question",
        json={
            "text": "2 + 2?",
            "option_a": "4",
            "option_b": "3",
            "option_c": "5",
            "option_d": "6",
            "correct_option": "a",
        },
    )
    assert question.status_code in (200, 201), question.text


@pytest.mark.asyncio
async def test_teacher_sees_only_own_subjects(two_teachers):
    """Begona fan roʻyxatda koʻrinmaydi."""
    client = two_teachers["client"]

    _as(client, two_teachers["token_first"])
    await client.post("/general-test/subject", json={"name": "Birinchi oʻqituvchi fani"})

    _as(client, two_teachers["token_second"])
    await client.post("/general-test/subject", json={"name": "Ikkinchi oʻqituvchi fani"})
    listing = await client.get("/general-test/subject", params={"limit": 50})

    assert listing.status_code == 200, listing.text
    names = [s["name"] for s in listing.json()["subjects"]]
    assert names == ["Ikkinchi oʻqituvchi fani"]


@pytest.mark.asyncio
async def test_foreign_subject_cannot_be_opened_or_changed(two_teachers):
    """Begona fanga murojaat 403 beradi — id ni terib kirib boʻlmaydi."""
    client = two_teachers["client"]

    _as(client, two_teachers["token_first"])
    subject_id = (
        await client.post("/general-test/subject", json={"name": "Yopiq fan"})
    ).json()["id"]

    _as(client, two_teachers["token_second"])
    assert (await client.get(f"/general-test/subject/{subject_id}")).status_code == 403
    assert (
        await client.put(f"/general-test/subject/{subject_id}", json={"name": "Bosib olindi"})
    ).status_code == 403
    assert (await client.delete(f"/general-test/subject/{subject_id}")).status_code == 403


@pytest.mark.asyncio
async def test_foreign_question_bank_is_closed(two_teachers, async_db):
    """Begona fanning savollarini koʻrib ham, qoʻshib ham boʻlmaydi."""
    client = two_teachers["client"]

    _as(client, two_teachers["token_first"])
    subject_id = (
        await client.post("/general-test/subject", json={"name": "Bank fani"})
    ).json()["id"]

    _as(client, two_teachers["token_second"])
    assert (await client.get(f"/general-test/subject/{subject_id}/questions")).status_code == 403
    added = await client.post(
        f"/general-test/subject/{subject_id}/question",
        json={
            "text": "Begona savol",
            "option_a": "a",
            "option_b": "b",
            "option_c": "c",
            "option_d": "d",
            "correct_option": "a",
        },
    )
    assert added.status_code == 403


@pytest.mark.asyncio
async def test_admin_sees_everything(auth_client, access_token, two_teachers, async_db):
    """Adminga umumiy nazorat qoladi."""
    client = two_teachers["client"]
    _as(client, two_teachers["token_first"])
    await client.post("/general-test/subject", json={"name": "Oʻqituvchi fani"})

    subject = GeneralTestSubject(name="Admin fani", created_by_user_id=None)
    async_db.add(subject)
    await async_db.commit()
    async_db.expire_all()

    # `auth_client` va `async_client` — BITTA obyekt: yuqoridagi `_as`
    # admin tokenini oʻqituvchinikiga almashtirib yuborgan. Shuning uchun
    # admin sarlavhasi qaytariladi.
    _as(auth_client, access_token)
    listing = await auth_client.get("/general-test/subject", params={"limit": 50})

    assert listing.status_code == 200, listing.text
    names = {s["name"] for s in listing.json()["subjects"]}
    assert {"Oʻqituvchi fani", "Admin fani"} <= names


@pytest.mark.asyncio
async def test_results_are_limited_to_own_tests(two_teachers, async_db):
    """Natijalar roʻyxatida ham faqat oʻz testlari.

    Aks holda oʻqituvchi begona testni yechgan odamlarning roʻyxatini
    koʻrardi — bu shaxsiy maʼlumot.
    """
    client = two_teachers["client"]
    _as(client, two_teachers["token_first"])
    subject_id = (
        await client.post("/general-test/subject", json={"name": "Natija fani"})
    ).json()["id"]
    async_db.add(
        GeneralTestQuestion(
            subject_id=subject_id,
            text="Savol",
            option_a="a",
            option_b="b",
            option_c="c",
            option_d="d",
            correct_option="a",
            order=1,
        )
    )
    await async_db.commit()

    created = await client.post(
        "/general-test/", json={"subject_id": subject_id, "duration": 10, "attempt_limit": 1}
    )
    assert created.status_code == 201, created.text

    # Ikkinchi oʻqituvchi — begona test roʻyxatda yoʻq.
    _as(client, two_teachers["token_second"])
    tests = await client.get("/general-test/", params={"limit": 50})
    assert tests.status_code == 200, tests.text
    assert tests.json()["tests"] == []

    results = await client.get("/general-test/results", params={"limit": 50})
    assert results.status_code == 200, results.text
    assert results.json()["total"] == 0


@pytest.mark.asyncio
async def test_foreign_result_cannot_be_deleted(two_teachers, async_db):
    """Begona testning urinishini oʻchirib boʻlmaydi.

    `delete:general_test_result` ruxsati qoʻlda ham berilishi mumkin
    (serverda oʻqituvchida u allaqachon bor edi), shuning uchun cheklov
    ruxsatga emas, egalikka tayanadi.
    """
    from app.modules.general_test.model import GeneralTestAttempt

    client = two_teachers["client"]
    _as(client, two_teachers["token_first"])
    subject_id = (
        await client.post("/general-test/subject", json={"name": "Urinish fani"})
    ).json()["id"]
    async_db.add(
        GeneralTestQuestion(
            subject_id=subject_id, text="S", option_a="a", option_b="b",
            option_c="c", option_d="d", correct_option="a", order=1,
        )
    )
    await async_db.commit()
    test_id = (
        await client.post(
            "/general-test/", json={"subject_id": subject_id, "duration": 10, "attempt_limit": 1}
        )
    ).json()["id"]

    attempt = GeneralTestAttempt(
        test_id=test_id, user_id=two_teachers["second"]["id"], status="completed", score=1,
    )
    async_db.add(attempt)
    await async_db.commit()
    await async_db.refresh(attempt)
    attempt_id = attempt.id  # `expire_all` dan keyin obyektga tegib boʻlmaydi
    async_db.expire_all()

    # Ikkinchi oʻqituvchiga `delete:general_test_result` ni ataylab beramiz —
    # ruxsat boʻlsa ham begona natija tegilmasligi kerak.
    from app.modules.auth.model import Permission, Role, RolePermission
    from sqlalchemy import select as sa_select

    role = (await async_db.execute(sa_select(Role).where(Role.name == "teacher_b"))).scalar_one()
    permission = Permission(name="delete:general_test_result")
    async_db.add(permission)
    await async_db.flush()
    async_db.add(RolePermission(role_id=role.id, permission_id=permission.id))
    await async_db.commit()

    _as(client, two_teachers["token_second"])
    response = await client.delete(f"/general-test/results/{attempt_id}")

    assert response.status_code == 403, response.text
