"""Dars o'chirilganda unga bog'langan test nima bo'ladi.

`quizzes.lesson_id` — ON DELETE SET NULL: test dars bilan birga o'chmaydi,
chunki unga natijalar bog'langan va ular bilan birga baholar ham yo'qolardi.
Lekin ajralib qolgan test faol bo'lib qolsa, «Faol testlar» ro'yxatida
turaveradi va eski PIN bilan ishlanaveradi — o'qituvchi darsni o'chirib
mavzuni yopdim deb o'ylaydi, talabalar esa topshirishda davom etadi.

Shuning uchun ajralish payti faollik so'ndiriladi. Test ham, natijalar ham
joyida qoladi.
"""

import pytest
from sqlalchemy import select

from app.modules.quiz.model import Quiz, Result


async def _create_course(auth_client, test_teacher, test_subject, test_faculty, test_kafedra, group_ids, name):
    response = await auth_client.post(
        "/course/",
        json={
            "name": name,
            "subject_id": test_subject.id,
            "course_type": "lecture",
            "teacher_id": test_teacher["user_id"],
            "group_ids": group_ids,
            "faculty_id": test_faculty["id"],
            "kafedra_id": test_kafedra["id"],
        },
    )
    assert response.status_code == 201
    return response.json()["id"]


async def _create_lesson(auth_client, course_id, topic="Introduction"):
    response = await auth_client.post("/lesson/", json={"course_id": course_id, "topic": topic})
    assert response.status_code == 201
    return response.json()["id"]


async def _delete_with_confirmation(auth_client, lesson_id):
    """Darsda test bo'lsa, birinchi urinish 409 bilan ogohlantiradi.

    Ikkinchi urinish — `force=true`: foydalanuvchi roziligi.
    """
    first = await auth_client.delete(f"/lesson/{lesson_id}")
    if first.status_code != 409:
        return first
    return await auth_client.delete(f"/lesson/{lesson_id}?force=true")


async def _attach_quiz(async_db, lesson_id, *, is_active, user_id):
    quiz = Quiz(
        title="Dars testi",
        question_number=5,
        duration=15,
        pin="4821",
        lesson_id=lesson_id,
        is_active=is_active,
        lecturer_id=user_id,
    )
    async_db.add(quiz)
    await async_db.commit()
    # ORM-obyekt emas, id qaytariladi: commit dan keyin obyekt «expired» bo'ladi
    # va uning maydoniga tegish lazy-load ni qo'zg'atadi (async sessiyada xato).
    quiz_id = quiz.id
    async_db.expunge(quiz)
    return quiz_id


@pytest.mark.asyncio
async def test_deleting_lesson_deactivates_its_quiz(
    auth_client, async_db, test_user, test_teacher, test_subject, test_group, test_faculty, test_kafedra
):
    """Asosiy holat: faol test darsdan ajraladi va o'chiriladi (faolligi)."""
    course_id = await _create_course(
        auth_client, test_teacher, test_subject, test_faculty, test_kafedra, [test_group["id"]], "Calculus"
    )
    lesson_id = await _create_lesson(auth_client, course_id)
    quiz_id = await _attach_quiz(async_db, lesson_id, is_active=True, user_id=test_user["id"])

    response = await _delete_with_confirmation(auth_client, lesson_id)
    assert response.status_code in (200, 204)

    async_db.expire_all()
    stored = (await async_db.execute(select(Quiz).where(Quiz.id == quiz_id))).scalar_one()

    # Test o'chib ketmadi — natijalar unga tayanadi.
    assert stored is not None
    # Darsdan ajraldi (ON DELETE SET NULL).
    assert stored.lesson_id is None
    # Va endi PIN bilan ishlab bo'lmaydi.
    assert stored.is_active is False


@pytest.mark.asyncio
async def test_deleting_lesson_keeps_quiz_results(
    auth_client, async_db, test_user, test_teacher, test_subject, test_group, test_faculty, test_kafedra
):
    """Baholar saqlanadi — SET NULL aynan shuning uchun tanlangan."""
    course_id = await _create_course(
        auth_client, test_teacher, test_subject, test_faculty, test_kafedra, [test_group["id"]], "Physics"
    )
    lesson_id = await _create_lesson(auth_client, course_id)
    quiz_id = await _attach_quiz(async_db, lesson_id, is_active=True, user_id=test_user["id"])

    result = Result(user_id=test_user["id"], quiz_id=quiz_id, correct_answers=4, wrong_answers=1, grade=4)
    async_db.add(result)
    await async_db.commit()
    result_id = result.id
    async_db.expunge(result)

    response = await _delete_with_confirmation(auth_client, lesson_id)
    assert response.status_code in (200, 204)

    async_db.expire_all()
    stored_result = (await async_db.execute(select(Result).where(Result.id == result_id))).scalar_one_or_none()

    assert stored_result is not None
    assert stored_result.grade == 4


@pytest.mark.asyncio
async def test_inactive_quiz_stays_inactive(
    auth_client, async_db, test_user, test_teacher, test_subject, test_group, test_faculty, test_kafedra
):
    """Faol bo'lmagan test uchun hech narsa o'zgarmaydi — ortiqcha yozuv yo'q."""
    course_id = await _create_course(
        auth_client, test_teacher, test_subject, test_faculty, test_kafedra, [test_group["id"]], "Chemistry"
    )
    lesson_id = await _create_lesson(auth_client, course_id)
    quiz_id = await _attach_quiz(async_db, lesson_id, is_active=False, user_id=test_user["id"])

    response = await _delete_with_confirmation(auth_client, lesson_id)
    assert response.status_code in (200, 204)

    async_db.expire_all()
    stored = (await async_db.execute(select(Quiz).where(Quiz.id == quiz_id))).scalar_one()

    assert stored.is_active is False
    assert stored.lesson_id is None


@pytest.mark.asyncio
async def test_other_lessons_quizzes_are_untouched(
    auth_client, async_db, test_user, test_teacher, test_subject, test_group, test_faculty, test_kafedra
):
    """Faqat o'chirilayotgan darsning testi so'nadi, qo'shnisiniki emas."""
    course_id = await _create_course(
        auth_client, test_teacher, test_subject, test_faculty, test_kafedra, [test_group["id"]], "Biology"
    )
    doomed_lesson_id = await _create_lesson(auth_client, course_id, topic="O'chiriladigan dars")
    kept_lesson_id = await _create_lesson(auth_client, course_id, topic="Qoladigan dars")
    doomed_quiz_id = await _attach_quiz(async_db, doomed_lesson_id, is_active=True, user_id=test_user["id"])
    kept_quiz_id = await _attach_quiz(async_db, kept_lesson_id, is_active=True, user_id=test_user["id"])

    response = await _delete_with_confirmation(auth_client, doomed_lesson_id)
    assert response.status_code in (200, 204)

    async_db.expire_all()
    doomed = (await async_db.execute(select(Quiz).where(Quiz.id == doomed_quiz_id))).scalar_one()
    kept = (await async_db.execute(select(Quiz).where(Quiz.id == kept_quiz_id))).scalar_one()

    assert doomed.is_active is False
    assert kept.is_active is True
    assert kept.lesson_id == kept_lesson_id


@pytest.mark.asyncio
async def test_delete_warns_about_attached_quiz(
    auth_client, async_db, test_user, test_teacher, test_subject, test_group, test_faculty, test_kafedra
):
    """Ogohlantirish testni ham eslatadi.

    Ilgari u faqat «o'chadi» deganlarni sanardi (resurslar, uy vazifasi), test
    esa qolib ketardi — o'qituvchi uni ham yo'qoladi deb o'ylardi.
    """
    course_id = await _create_course(
        auth_client, test_teacher, test_subject, test_faculty, test_kafedra, [test_group["id"]], "Algebra"
    )
    lesson_id = await _create_lesson(auth_client, course_id)
    await _attach_quiz(async_db, lesson_id, is_active=True, user_id=test_user["id"])

    response = await auth_client.delete(f"/lesson/{lesson_id}")

    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["requires_confirmation"] is True
    warnings = " ".join(detail["warnings"]).lower()
    # Test o'chmasligi va faolligi so'nishi — ikkalasi ham aytiladi.
    assert "test" in warnings
    assert "o'chmaydi" in warnings
    assert "faol" in warnings


@pytest.mark.asyncio
async def test_delete_without_related_data_needs_no_confirmation(
    auth_client, test_teacher, test_subject, test_group, test_faculty, test_kafedra
):
    """Bo'sh darsda ortiqcha savol berilmaydi — bir bosishda o'chadi."""
    course_id = await _create_course(
        auth_client, test_teacher, test_subject, test_faculty, test_kafedra, [test_group["id"]], "Geometry"
    )
    lesson_id = await _create_lesson(auth_client, course_id)

    response = await auth_client.delete(f"/lesson/{lesson_id}")

    assert response.status_code in (200, 204)


@pytest.mark.asyncio
async def test_orphaned_filter_finds_quiz_whose_lesson_was_deleted(
    auth_client, async_db, test_user, test_teacher, test_subject, test_group, test_faculty, test_kafedra
):
    """Darsdan ajralgan test guruhsiz qoladi va boshqa filtrlarga tushmaydi.

    `without_lesson` — uni topishning yagona yo'li.
    """
    course_id = await _create_course(
        auth_client, test_teacher, test_subject, test_faculty, test_kafedra, [test_group["id"]], "History"
    )
    lesson_id = await _create_lesson(auth_client, course_id)
    quiz_id = await _attach_quiz(async_db, lesson_id, is_active=True, user_id=test_user["id"])

    await _delete_with_confirmation(auth_client, lesson_id)

    # Boshqa darsning testi — filtr ishlamasa, u ham javobga tushadi.
    other_lesson_id = await _create_lesson(auth_client, course_id, topic="Qoladigan dars")
    attached_quiz_id = await _attach_quiz(async_db, other_lesson_id, is_active=False, user_id=test_user["id"])

    response = await auth_client.get("/quiz/", params={"without_lesson": True, "limit": 50})
    assert response.status_code == 200
    quizzes = response.json()["quizzes"]
    found = [quiz["id"] for quiz in quizzes]

    assert quiz_id in found
    # Darsi bor test chiqmaydi — aks holda filtr shunchaki e'tiborsiz qolgan.
    assert attached_quiz_id not in found
    assert all(quiz["lesson_id"] is None for quiz in quizzes)


@pytest.mark.asyncio
async def test_orphaned_filter_ignores_semester_quizzes(
    auth_client, async_db, test_user, test_teacher, test_subject, test_group, test_faculty, test_kafedra
):
    """Semestr yakuni darsga umuman biriktirilmaydi — u «egasiz» emas."""
    semester_quiz = Quiz(
        title="Semestr yakuni",
        question_number=20,
        duration=60,
        pin="9001",
        lesson_id=None,
        is_active=False,
        lecturer_id=test_user["id"],
        quiz_type="SEMESTER_FINAL",
    )
    async_db.add(semester_quiz)
    await async_db.commit()
    semester_quiz_id = semester_quiz.id
    async_db.expunge(semester_quiz)

    response = await auth_client.get("/quiz/", params={"without_lesson": True, "limit": 50})
    assert response.status_code == 200
    found = [quiz["id"] for quiz in response.json()["quizzes"]]

    assert semester_quiz_id not in found
