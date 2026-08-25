"""Названия тестов и курсов собираются на сервере.

Организатор их больше не печатает: в форме остались только преподаватель,
предмет, группа и семестр, а имя выводится из них — см.
`quiz/repository.py::build_title` и `course/repository.py::_build_course_name`.
"""

from datetime import datetime

import pytest

from app.core.schemas import TASHKENT_TZ


def _today() -> str:
    return datetime.now(TASHKENT_TZ).strftime("%d.%m.%Y")


@pytest.mark.asyncio
async def test_quiz_title_is_generated_from_selection(auth_client, test_subject, test_group):
    users_resp = await auth_client.get("/user/")
    user_id = users_resp.json()["users"][0]["id"]

    response = await auth_client.post(
        "/quiz/",
        json={
            "question_number": 5,
            "duration": 30,
            "pin": "4321",
            "user_id": user_id,
            "group_id": test_group["id"],
            "subject_id": test_subject.id,
            "semester_number": 1,
            "is_active": False,
        },
    )

    assert response.status_code == 201
    assert response.json()["title"] == f"{test_subject.name} — {test_group['name']} — {_today()} (1-semestr)"


@pytest.mark.asyncio
async def test_quiz_title_from_client_wins(auth_client, test_subject, test_group):
    """Старый клиент всё ещё присылает свой заголовок — он не должен затираться."""
    users_resp = await auth_client.get("/user/")
    user_id = users_resp.json()["users"][0]["id"]

    response = await auth_client.post(
        "/quiz/",
        json={
            "title": "Legacy title",
            "question_number": 5,
            "duration": 30,
            "pin": "4322",
            "user_id": user_id,
            "group_id": test_group["id"],
            "subject_id": test_subject.id,
            "is_active": False,
        },
    )

    assert response.status_code == 201
    assert response.json()["title"] == "Legacy title"


@pytest.mark.asyncio
async def test_course_name_and_org_fields_are_derived(
    auth_client,
    async_db,
    test_user,
    test_faculty,
    test_kafedra,
    test_group,
):
    from app.modules.quiz.model import Subject

    subject = Subject(name="Fizika", kafedra_id=test_kafedra["id"])
    async_db.add(subject)
    await async_db.commit()
    await async_db.refresh(subject)

    response = await auth_client.post(
        "/course/",
        json={
            "subject_id": subject.id,
            "teacher_id": test_user["id"],
            "semester_number": 1,
            "group_ids": [test_group["id"]],
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["name"] == f"Fizika — {test_group['name']} (1-semestr)"
    # Кафедра — от предмета, факультет — от группы: их больше не выбирают руками,
    # но фильтры списка курсов по-прежнему на них смотрят.
    assert data["kafedra_id"] == test_kafedra["id"]
    assert data["faculty_id"] == test_faculty["id"]


@pytest.mark.asyncio
async def test_course_name_follows_semester_change(auth_client, test_user, test_subject, test_group):
    create_response = await auth_client.post(
        "/course/",
        json={
            "subject_id": test_subject.id,
            "teacher_id": test_user["id"],
            "semester_number": 1,
            "group_ids": [test_group["id"]],
        },
    )
    assert create_response.status_code == 201
    course_id = create_response.json()["id"]

    update_response = await auth_client.put(
        f"/course/{course_id}",
        json={"semester_number": 2},
    )

    assert update_response.status_code == 200
    assert update_response.json()["name"] == f"{test_subject.name} — {test_group['name']} (2-semestr)"
