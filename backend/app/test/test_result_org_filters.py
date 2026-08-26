"""Фильтры списка результатов по факультету и кафедре.

Факультет берётся у группы результата (сторона студента), кафедра — у автора
теста: прямой связи «результат → кафедра» в данных нет.
"""

import pytest


async def _complete_quiz(auth_client, *, subject_id: int, group_id: int, lecturer_user_id: int, pin: str) -> None:
    question = await auth_client.post(
        "/question/",
        json={
            "subject_id": subject_id,
            "user_id": lecturer_user_id,
            "text": "Filtr uchun savol",
            "option_a": "A",
            "option_b": "B",
            "option_c": "C",
            "option_d": "D",
            "correct_option": "a",
        },
    )
    assert question.status_code == 201

    quiz = await auth_client.post(
        "/quiz/",
        json={
            "question_number": 1,
            "duration": 60,
            "pin": pin,
            "user_id": lecturer_user_id,
            "group_id": group_id,
            "subject_id": subject_id,
            "is_active": True,
        },
    )
    assert quiz.status_code == 201
    quiz_id = quiz.json()["id"]

    start = await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz_id, "pin": pin})
    assert start.status_code == 200
    result_id = start.json()["result_id"]

    for question_item in start.json()["questions"]:
        answer = await auth_client.post(
            "/quiz_process/submit_answer",
            json={"result_id": result_id, "question_id": question_item["id"], "answer": "A"},
        )
        assert answer.status_code == 200

    end = await auth_client.post("/quiz_process/end_quiz", json={"quiz_id": quiz_id, "result_id": result_id})
    assert end.status_code == 200


@pytest.mark.asyncio
async def test_filter_results_by_faculty_and_kafedra(
    auth_client, test_subject, test_group, test_faculty, test_kafedra, test_teacher
):
    await _complete_quiz(
        auth_client,
        subject_id=test_subject.id,
        group_id=test_group["id"],
        lecturer_user_id=test_teacher["user_id"],
        pin="1234",
    )

    baseline = await auth_client.get("/result/")
    assert baseline.status_code == 200
    assert baseline.json()["total"] == 1

    by_faculty = await auth_client.get("/result/", params={"faculty_id": test_faculty["id"]})
    assert by_faculty.status_code == 200
    assert by_faculty.json()["total"] == 1

    by_kafedra = await auth_client.get("/result/", params={"kafedra_id": test_kafedra["id"]})
    assert by_kafedra.status_code == 200
    assert by_kafedra.json()["total"] == 1

    # Чужие факультет и кафедра результат не показывают.
    other_faculty = await auth_client.post("/faculty/", json={"name": "Boshqa fakultet"})
    assert other_faculty.status_code == 201
    other_kafedra = await auth_client.post(
        "/kafedra/", json={"name": "Boshqa kafedra", "faculty_id": other_faculty.json()["id"]}
    )
    assert other_kafedra.status_code == 201

    assert (await auth_client.get("/result/", params={"faculty_id": other_faculty.json()["id"]})).json()["total"] == 0
    assert (await auth_client.get("/result/", params={"kafedra_id": other_kafedra.json()["id"]})).json()["total"] == 0

    # Оба фильтра вместе — пересечение, а не объединение.
    both_match = await auth_client.get(
        "/result/", params={"faculty_id": test_faculty["id"], "kafedra_id": test_kafedra["id"]}
    )
    assert both_match.json()["total"] == 1
    mixed = await auth_client.get(
        "/result/", params={"faculty_id": test_faculty["id"], "kafedra_id": other_kafedra.json()["id"]}
    )
    assert mixed.json()["total"] == 0
