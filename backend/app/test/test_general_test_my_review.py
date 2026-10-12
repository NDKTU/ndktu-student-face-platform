"""Elementar: talaba o'z urinishining tahlilini ko'radi — to'g'ri javobsiz.

Talaba qaysi savolda adashganini ko'rishi kerak, lekin to'g'ri variant
yuborilmaydi: aks holda har bir tahlil savollar bankining bir bo'lagini
oshkor qilardi. Shuningdek:

* faqat o'z va yakunlangan urinish (ketayotgan testda «to'g'ri» belgisi
  javobni tekshirish vositasi bo'lardi);
* testni hozir boshqalar yechayotgan bo'lsa — savollar yopiq, ball ko'rinadi.
"""

from datetime import timedelta

import pytest
from core.utils.password_hash import hash_password
from sqlalchemy import select

from app.core.mixins.time_stamp_mixin import utcnow_naive
from app.modules.auth.model import Permission, Role, RolePermission, User, UserRole
from app.modules.general_test.model import (
    GeneralTest,
    GeneralTestAnswer,
    GeneralTestAttempt,
    GeneralTestQuestion,
    GeneralTestSubject,
)


async def _student(async_client, async_db, username: str) -> dict:
    role = (await async_db.execute(select(Role).where(Role.name == "gt_taker"))).scalar_one_or_none()
    if role is None:
        role = Role(name="gt_taker")
        async_db.add(role)
        await async_db.flush()
        permission = (
            await async_db.execute(select(Permission).where(Permission.name == "general_test:take"))
        ).scalar_one_or_none()
        if permission is None:
            permission = Permission(name="general_test:take")
            async_db.add(permission)
            await async_db.flush()
        async_db.add(RolePermission(role_id=role.id, permission_id=permission.id))

    user = User(username=username, password=hash_password("password123"), is_active=True)
    async_db.add(user)
    await async_db.flush()
    async_db.add(UserRole(user_id=user.id, role_id=role.id))
    await async_db.commit()

    response = await async_client.post("/user/login", json={"username": username, "password": "password123"})
    assert response.status_code == 200, response.text
    return {"id": user.id, "headers": {"Authorization": f"Bearer {response.json()['access_token']}"}}


async def _test_with_attempt(async_db, user_id: int, status: str = "completed") -> dict:
    subject = GeneralTestSubject(name=f"Tahlil fani {user_id}")
    async_db.add(subject)
    await async_db.flush()
    first = GeneralTestQuestion(
        subject_id=subject.id, text="Birinchi", option_a="a1", option_b="b1",
        option_c="c1", option_d="d1", correct_option="b", order=1,
    )
    second = GeneralTestQuestion(
        subject_id=subject.id, text="Ikkinchi", option_a="a2", option_b="b2",
        option_c="c2", option_d="d2", correct_option="c", order=2,
    )
    test = GeneralTest(subject_id=subject.id, title="Tahlil testi", duration=10, is_active=True)
    async_db.add_all([first, second, test])
    await async_db.flush()

    attempt = GeneralTestAttempt(
        test_id=test.id,
        user_id=user_id,
        status=status,
        layout=[{"q": second.id, "o": "dcba"}, {"q": first.id, "o": "abcd"}],
        total_questions=2,
        correct_answers=1,
        score=50,
        finished_at=utcnow_naive() if status == "completed" else None,
    )
    async_db.add(attempt)
    await async_db.flush()
    async_db.add_all(
        [
            GeneralTestAnswer(attempt_id=attempt.id, question_id=second.id, selected_option="c", is_correct=True),
            GeneralTestAnswer(attempt_id=attempt.id, question_id=first.id, selected_option="a", is_correct=False),
        ]
    )
    await async_db.commit()
    return {"test_id": test.id, "attempt_id": attempt.id, "first": first.id, "second": second.id}


@pytest.mark.asyncio
async def test_student_sees_own_mistakes_without_correct_answers(async_client, async_db):
    me = await _student(async_client, async_db, "gt_review_me")
    data = await _test_with_attempt(async_db, me["id"])

    response = await async_client.get(f"/general-test/my-results/{data['attempt_id']}", headers=me["headers"])

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["locked"] is False
    assert body["result"]["score"] == 50
    assert [q["id"] for q in body["questions"]] == [data["second"], data["first"]]
    # Variantlar talaba ko'rgan aralash tartibda.
    assert [o["key"] for o in body["questions"][0]["options"]] == ["d", "c", "b", "a"]
    assert body["questions"][0]["selected"] == "c"
    assert body["questions"][0]["is_correct"] is True
    assert body["questions"][1]["selected"] == "a"
    assert body["questions"][1]["is_correct"] is False
    # Asosiysi: to'g'ri variant javobda umuman yo'q.
    assert all("correct_option" not in q for q in body["questions"])


@pytest.mark.asyncio
async def test_foreign_attempt_is_404(async_client, async_db):
    owner = await _student(async_client, async_db, "gt_review_owner")
    stranger = await _student(async_client, async_db, "gt_review_stranger")
    data = await _test_with_attempt(async_db, owner["id"])

    response = await async_client.get(
        f"/general-test/my-results/{data['attempt_id']}", headers=stranger["headers"]
    )

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_attempt_in_progress_has_no_review(async_client, async_db):
    """Ketayotgan urinishda «to'g'ri/noto'g'ri» belgisi javobni tekshirishga aylanardi."""
    me = await _student(async_client, async_db, "gt_review_running")
    data = await _test_with_attempt(async_db, me["id"], status="in_progress")

    response = await async_client.get(f"/general-test/my-results/{data['attempt_id']}", headers=me["headers"])

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_review_locked_while_others_take_the_test(async_client, async_db):
    me = await _student(async_client, async_db, "gt_review_done")
    other = await _student(async_client, async_db, "gt_review_other")
    data = await _test_with_attempt(async_db, me["id"])
    running = GeneralTestAttempt(test_id=data["test_id"], user_id=other["id"], status="in_progress", layout=[])
    async_db.add(running)
    await async_db.commit()

    locked = await async_client.get(f"/general-test/my-results/{data['attempt_id']}", headers=me["headers"])
    assert locked.status_code == 200, locked.text
    assert locked.json()["locked"] is True
    assert locked.json()["questions"] == []
    # Ball baribir ko'rinadi.
    assert locked.json()["result"]["score"] == 50

    # Vaqti o'tib ketgan, yopilmagan urinish to'smaydi.
    running.started_at = utcnow_naive() - timedelta(hours=2)
    await async_db.commit()
    opened = await async_client.get(f"/general-test/my-results/{data['attempt_id']}", headers=me["headers"])
    assert opened.json()["locked"] is False
    assert len(opened.json()["questions"]) == 2
