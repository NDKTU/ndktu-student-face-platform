import pytest
from sqlalchemy import select

from app.modules.organization_structure.model import TeacherGroup


@pytest.mark.asyncio
async def test_create_quiz_does_not_create_group_teacher(
    auth_client, async_db, test_user, test_subject, test_group, make_questions
):
    """Создание теста не выдаёт создателю прав на группу.

    Раньше `create_quiz` заводил связку с группой, если её не было. Под разделением
    ролей это дыра: тест создаёт организатор, и он молча становился бы преподавателем
    группы — то есть получал бы доступ к её тестам и результатам. Права не должны
    появляться как побочный эффект действия.
    """
    user_id = test_user["id"]
    group_id = test_group["id"]

    stmt = select(TeacherGroup).where(TeacherGroup.group_id == group_id)
    assert (await async_db.execute(stmt)).scalar_one_or_none() is None

    await make_questions(subject_id=test_subject.id, user_id=user_id, count=2)

    payload = {
        "title": "Group Teacher Test Quiz",
        "question_number": 2,
        "duration": 30,
        "pin": "1234",
        "is_active": True,
        "lecturer_id": user_id,
        "group_id": group_id,
        "subject_id": test_subject.id,
    }

    resp = await auth_client.post("/quiz/", json=payload)
    assert resp.status_code == 201

    async_db.expire_all()
    assert (await async_db.execute(stmt)).scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_repeat_quiz_does_not_create_group_teacher(
    auth_client, async_db, test_user, test_subject, test_group, make_questions
):
    """Пересдача тоже не заводит связку с группой — та же причина."""
    user_id = test_user["id"]
    group_id = test_group["id"]

    await make_questions(subject_id=test_subject.id, user_id=user_id, count=1)

    create_resp = await auth_client.post(
        "/quiz/",
        json={
            "title": "Repeat No TeacherGroup",
            "question_number": 1,
            "duration": 30,
            "pin": "4321",
            "is_active": True,
            "lecturer_id": user_id,
            "group_id": group_id,
            "subject_id": test_subject.id,
        },
    )
    assert create_resp.status_code == 201
    quiz_id = create_resp.json()["id"]

    repeat_resp = await auth_client.post(f"/quiz/{quiz_id}/repeat")
    assert repeat_resp.status_code == 201

    async_db.expire_all()
    stmt = select(TeacherGroup).where(TeacherGroup.group_id == group_id)
    assert (await async_db.execute(stmt)).scalar_one_or_none() is None
