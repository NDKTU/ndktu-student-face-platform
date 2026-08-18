"""Разделение владения тестом: вопросы лектора, тест собирает организатор.

Проверяется требование заказчика: лектор грузит вопросы и не создаёт тест, тест
создаёт отдельный ответственный. До этого разделения `quizzes.user_id` означал
одновременно и автора вопросов, и создателя теста, поэтому тест, созданный
организатором, не получил бы ни одного вопроса.
"""

import pytest
import pytest_asyncio
from sqlalchemy import func, select

from app.modules.quiz.model import QuizQuestion


@pytest_asyncio.fixture
async def lecturer(auth_client, test_role):
    """Отдельный преподаватель — владелец банка вопросов, не создатель теста."""
    response = await auth_client.post(
        "/user/",
        json={
            "username": "lecturer_user",
            "password": "password123",
            "roles": [{"name": "Admin"}],
        },
    )
    assert response.status_code == 201
    return response.json()


@pytest.mark.asyncio
async def test_organizer_builds_quiz_from_lecturer_bank(
    auth_client, async_db, test_user, lecturer, test_subject, test_group, make_questions
):
    """Вопросы берутся у указанного лектора, а создателем пишется организатор."""
    lecturer_id = lecturer["id"]
    organizer_id = test_user["id"]
    assert lecturer_id != organizer_id

    question_ids = await make_questions(subject_id=test_subject.id, user_id=lecturer_id, count=3)

    response = await auth_client.post(
        "/quiz/",
        json={
            "title": "Yakuniy nazorat",
            "question_number": 3,
            "duration": 60,
            "pin": "1357",
            "is_active": True,
            "lecturer_id": lecturer_id,
            "group_id": test_group["id"],
            "subject_id": test_subject.id,
        },
    )
    assert response.status_code == 201
    data = response.json()

    # Лектор — владелец банка, организатор — создатель. Раньше это было одно поле.
    assert data["lecturer_id"] == lecturer_id
    assert data["created_by_user_id"] == organizer_id
    # Устаревший алиас остаётся для старых клиентов и указывает на лектора.
    assert data["user_id"] == lecturer_id

    linked = (
        await async_db.execute(select(QuizQuestion.question_id).where(QuizQuestion.quiz_id == data["id"]))
    ).scalars()
    assert sorted(linked) == sorted(question_ids)


@pytest.mark.asyncio
async def test_created_by_comes_from_token_not_body(
    auth_client, test_user, lecturer, test_subject, test_group, make_questions
):
    """Организатор не может записать создание теста на чужое имя.

    В теле запроса нет поля создателя — он берётся из токена. Даже указав чужой
    `lecturer_id`, создателем остаётся тот, кто выполнил запрос.
    """
    await make_questions(subject_id=test_subject.id, user_id=lecturer["id"], count=1)

    response = await auth_client.post(
        "/quiz/",
        json={
            "title": "Kim yaratdi",
            "question_number": 1,
            "duration": 30,
            "pin": "2468",
            "is_active": True,
            "lecturer_id": lecturer["id"],
            "group_id": test_group["id"],
            "subject_id": test_subject.id,
        },
    )
    assert response.status_code == 201
    assert response.json()["created_by_user_id"] == test_user["id"]


@pytest.mark.asyncio
async def test_activation_requires_enough_questions(auth_client, lecturer, test_subject, test_group, make_questions):
    """Активный тест не может требовать больше вопросов, чем есть в банке.

    Иначе start_quiz молча выдал бы столько, сколько нашлось: тест на 5 вопросов
    из банка в 2 превратился бы в экзамен на 2 — с оценкой, несравнимой с другими
    группами.
    """
    await make_questions(subject_id=test_subject.id, user_id=lecturer["id"], count=2)

    payload = {
        "title": "Savol yetarli emas",
        "question_number": 5,
        "duration": 30,
        "pin": "1122",
        "is_active": True,
        "lecturer_id": lecturer["id"],
        "group_id": test_group["id"],
        "subject_id": test_subject.id,
    }

    response = await auth_client.post("/quiz/", json=payload)
    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["code"] == "not_enough_questions"
    assert detail["available"] == 2
    assert detail["requested"] == 5


@pytest.mark.asyncio
async def test_inactive_quiz_may_be_prepared_with_empty_bank(auth_client, lecturer, test_subject, test_group):
    """Неактивный тест организатор готовит заранее, пока лектор ещё грузит вопросы."""
    response = await auth_client.post(
        "/quiz/",
        json={
            "title": "Tayyorlanmoqda",
            "question_number": 10,
            "duration": 30,
            "pin": "3344",
            "is_active": False,
            "lecturer_id": lecturer["id"],
            "group_id": test_group["id"],
            "subject_id": test_subject.id,
        },
    )
    assert response.status_code == 201
    assert response.json()["is_active"] is False


@pytest.mark.asyncio
async def test_activation_of_prepared_quiz_is_blocked_while_bank_is_short(
    auth_client, lecturer, test_subject, test_group
):
    """Подготовленный заранее тест нельзя включить, пока вопросов не хватает."""
    create_resp = await auth_client.post(
        "/quiz/",
        json={
            "title": "Faollashtirish",
            "question_number": 4,
            "duration": 30,
            "pin": "5566",
            "is_active": False,
            "lecturer_id": lecturer["id"],
            "group_id": test_group["id"],
            "subject_id": test_subject.id,
        },
    )
    assert create_resp.status_code == 201
    quiz_id = create_resp.json()["id"]

    activate_resp = await auth_client.put(
        f"/quiz/{quiz_id}",
        json={
            "title": "Faollashtirish",
            "question_number": 4,
            "duration": 30,
            "pin": "5566",
            "is_active": True,
            "lecturer_id": lecturer["id"],
            "group_id": test_group["id"],
            "subject_id": test_subject.id,
        },
    )
    assert activate_resp.status_code == 409
    assert activate_resp.json()["detail"]["code"] == "not_enough_questions"


@pytest.mark.asyncio
async def test_lecturer_cannot_be_changed_after_creation(
    auth_client, lecturer, test_user, test_subject, test_group, make_questions
):
    """Смена лектора после создания запрещена.

    Вопросы подобраны в quiz_questions один раз, при создании. Сменив лектора,
    тест остался бы собран из банка прежнего — молча и незаметно.
    """
    await make_questions(subject_id=test_subject.id, user_id=lecturer["id"], count=1)

    create_resp = await auth_client.post(
        "/quiz/",
        json={
            "title": "O'qituvchini almashtirish",
            "question_number": 1,
            "duration": 30,
            "pin": "7788",
            "is_active": True,
            "lecturer_id": lecturer["id"],
            "group_id": test_group["id"],
            "subject_id": test_subject.id,
        },
    )
    assert create_resp.status_code == 201
    quiz_id = create_resp.json()["id"]

    update_resp = await auth_client.put(
        f"/quiz/{quiz_id}",
        json={
            "title": "O'qituvchini almashtirish",
            "question_number": 1,
            "duration": 30,
            "pin": "7788",
            "is_active": True,
            "lecturer_id": test_user["id"],  # другой лектор
            "group_id": test_group["id"],
            "subject_id": test_subject.id,
        },
    )
    assert update_resp.status_code == 409
    assert update_resp.json()["detail"]["code"] == "lecturer_change_forbidden"


@pytest.mark.asyncio
async def test_available_questions_returns_count_only(auth_client, lecturer, test_subject, make_questions):
    """Организатор видит количество доступных вопросов, но не их содержимое."""
    await make_questions(subject_id=test_subject.id, user_id=lecturer["id"], count=4, prefix="Maxfiy savol ")

    response = await auth_client.get(
        "/quiz/available-questions",
        params={"lecturer_id": lecturer["id"], "subject_id": test_subject.id},
    )
    assert response.status_code == 200
    data = response.json()
    assert data == {
        "lecturer_id": lecturer["id"],
        "subject_id": test_subject.id,
        "available": 4,
    }
    # Ни формулировок, ни вариантов ответа в ответе быть не должно.
    assert "Maxfiy savol" not in response.text


@pytest.mark.asyncio
async def test_available_questions_counts_only_this_lecturer(
    auth_client, lecturer, test_user, test_subject, make_questions
):
    """Банк персональный: вопросы другого преподавателя в счёт не идут."""
    # Суммарно не больше пяти вопросов за тест: на POST /question/ стоит
    # ограничение 5 запросов в минуту.
    await make_questions(subject_id=test_subject.id, user_id=lecturer["id"], count=2)
    await make_questions(subject_id=test_subject.id, user_id=test_user["id"], count=3, prefix="Boshqa ")

    response = await auth_client.get(
        "/quiz/available-questions",
        params={"lecturer_id": lecturer["id"], "subject_id": test_subject.id},
    )
    assert response.status_code == 200
    assert response.json()["available"] == 2


@pytest.mark.asyncio
async def test_repeat_keeps_lecturer_and_records_new_organizer(
    auth_client, async_db, test_user, lecturer, test_subject, test_group, make_questions
):
    """Пересдача наследует лектора, а создателем пишется тот, кто её выдал."""
    await make_questions(subject_id=test_subject.id, user_id=lecturer["id"], count=2)

    create_resp = await auth_client.post(
        "/quiz/",
        json={
            "title": "Qayta topshirish",
            "question_number": 2,
            "duration": 30,
            "pin": "9900",
            "is_active": True,
            "lecturer_id": lecturer["id"],
            "group_id": test_group["id"],
            "subject_id": test_subject.id,
        },
    )
    assert create_resp.status_code == 201
    quiz_id = create_resp.json()["id"]

    repeat_resp = await auth_client.post(f"/quiz/{quiz_id}/repeat")
    assert repeat_resp.status_code == 201
    repeated = repeat_resp.json()

    assert repeated["lecturer_id"] == lecturer["id"]
    assert repeated["created_by_user_id"] == test_user["id"]
    assert repeated["attempt"] == 2

    linked = (
        await async_db.execute(
            select(func.count()).select_from(QuizQuestion).where(QuizQuestion.quiz_id == repeated["id"])
        )
    ).scalar()
    assert linked == 2
