"""Xizmat fani: test uchun tuziladi, hisob-kitobga kirmaydi.

Nima uchun kerak. Testni fansiz yaratib boʻlmaydi — savollar fanga
bogʻlangan. Lekin bir martalik yoki tashqi test natijasi reytingga
tushmasligi kerak. Va bu jimgina buziladi: raqam notoʻgʻri boʻladi,
xato esa chiqmaydi.

Buzilish aniq: reyting natijalarni GURUH boʻyicha qoʻshadi
(`Result.group_id == TeacherGroup.group_id`), yaʼni guruhga
biriktirilgan bir martalik test oʻsha guruhning BARCHA oʻqituvchilari
reytingiga tushardi.
"""

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.modules.quiz.model import Quiz, QuizGroup, Result, Subject


async def _make_teacher_with_group(async_db, make_group, make_teacher, test_faculty, test_kafedra, name: str):
    """Guruhga biriktirilgan oʻqituvchi.

    `Teacher` ni qoʻlda yigʻmaymiz: unda majburiy maydonlar bor va
    `make_teacher` fikstirasi ularni allaqachon toʻgʻri toʻldiradi.
    """
    from app.modules.organization_structure.model import TeacherGroup

    group = await make_group(f"GRP-{name}", test_faculty["id"])
    teacher = await make_teacher(f"teacher_{name}", test_kafedra["id"])
    async_db.add(TeacherGroup(teacher_id=teacher["id"], group_id=group["id"]))
    await async_db.commit()
    return {"user_id": teacher["user_id"], "teacher_id": teacher["id"], "group_id": group["id"]}


async def _add_result(async_db, *, group_id: int, subject_id: int, user_id: int, grade: int):
    result = Result(
        user_id=user_id,
        subject_id=subject_id,
        group_id=group_id,
        status="completed",
        grade=grade,
        correct_answers=grade,
        wrong_answers=0,
    )
    async_db.add(result)
    await async_db.commit()
    return result


# ─────────────────────── Asosiy chegara: reyting ───────────────────────


@pytest.mark.asyncio
async def test_service_subject_result_is_not_in_ranking(
    async_db, make_group, make_teacher, make_subject, test_faculty, test_kafedra, auth_client
):
    """Xizmat fani natijasi oʻqituvchi reytingiga TUSHMAYDI."""
    from app.modules.auth.teacher.repository import get_teacher_repository

    t = await _make_teacher_with_group(async_db, make_group, make_teacher, test_faculty, test_kafedra, "svc")

    service = Subject(name="Kirish sinovi", is_countable=False)
    async_db.add(service)
    await async_db.commit()
    await async_db.refresh(service)

    await _add_result(
        async_db, group_id=t["group_id"], subject_id=service.id, user_id=t["user_id"], grade=5
    )

    ranking = await get_teacher_repository.get_ranking(async_db, group_id=t["group_id"])
    rows = [r for r in ranking.teachers if r.teacher_id == t["teacher_id"]]

    assert rows, "oʻqituvchi reytingda boʻlishi kerak"
    # Natija hisobga olinmaydi: talaba ham, oʻrtacha baho ham nol.
    assert rows[0].student_count == 0
    assert rows[0].avg_grade == 0


@pytest.mark.asyncio
async def test_normal_subject_result_stays_in_ranking(
    async_db, make_group, make_teacher, make_subject, test_faculty, test_kafedra, auth_client
):
    """Filtr ortiqcha kesmasin: oddiy fan natijasi joyida qoladi."""
    from app.modules.auth.teacher.repository import get_teacher_repository

    t = await _make_teacher_with_group(async_db, make_group, make_teacher, test_faculty, test_kafedra, "normal")
    subject = await make_subject("Matematika sinov")

    await _add_result(
        async_db, group_id=t["group_id"], subject_id=subject.id, user_id=t["user_id"], grade=5
    )

    ranking = await get_teacher_repository.get_ranking(async_db, group_id=t["group_id"])
    rows = [r for r in ranking.teachers if r.teacher_id == t["teacher_id"]]

    assert rows and rows[0].student_count == 1
    assert rows[0].avg_grade == 5.0


@pytest.mark.asyncio
async def test_result_without_subject_is_still_counted(
    async_db, make_group, make_teacher, test_faculty, test_kafedra, auth_client
):
    """Fansiz natija yoʻqolmasligi kerak.

    Fan oʻchirilganda `Result.subject_id` `SET NULL` boʻladi. Bunday
    qatorni chiqarib tashlasak, eski natijalar jimgina yoʻqolardi.
    """
    from app.modules.auth.teacher.repository import get_teacher_repository

    t = await _make_teacher_with_group(async_db, make_group, make_teacher, test_faculty, test_kafedra, "nosub")
    await _add_result(
        async_db, group_id=t["group_id"], subject_id=None, user_id=t["user_id"], grade=4
    )

    ranking = await get_teacher_repository.get_ranking(async_db, group_id=t["group_id"])
    rows = [r for r in ranking.teachers if r.teacher_id == t["teacher_id"]]

    assert rows and rows[0].student_count == 1
    assert rows[0].avg_grade == 4.0


# ─────────────────────────── Fan yaratish ──────────────────────────────


@pytest.mark.asyncio
async def test_service_subject_is_always_uncountable(auth_client, async_db):
    """Mijoz nima yuborsa ham, xizmat fani hisobga kirmaydi."""
    response = await auth_client.post("/subject/service", json={"name": "Sinov fani", "is_countable": True})

    assert response.status_code == 201, response.text
    assert response.json()["is_countable"] is False

    row = (
        await async_db.execute(select(Subject).where(Subject.name == "sinov fani"))
    ).scalar_one()
    assert row.is_countable is False
    # Qoʻlda kiritilgan satr: EPOS koʻzgusi bilan chalkashmasin.
    assert row.external_source is None


@pytest.mark.asyncio
async def test_service_subject_hidden_from_default_list(auth_client, async_db):
    async_db.add(Subject(name="yashirin sinov", is_countable=False))
    await async_db.commit()

    default = await auth_client.get("/subject/", params={"limit": 200})
    with_service = await auth_client.get("/subject/", params={"limit": 200, "include_service": True})

    names = [s["name"] for s in default.json()["subjects"]]
    names_all = [s["name"] for s in with_service.json()["subjects"]]

    assert "yashirin sinov" not in names
    assert "yashirin sinov" in names_all
    # Sanoq ham filtrga boʻysunadi, aks holda oxirgi sahifa boʻsh chiqardi.
    assert with_service.json()["total"] == default.json()["total"] + 1


# ──────────────────────── Bir testga koʻp guruh ────────────────────────


@pytest.mark.asyncio
async def test_quiz_can_target_several_groups(
    auth_client, async_db, make_group, make_subject, test_faculty, test_user
):
    first = await make_group("MULTI-1", test_faculty["id"])
    second = await make_group("MULTI-2", test_faculty["id"])
    subject = await make_subject("Koʻp guruh fani")

    response = await auth_client.post(
        "/quiz/",
        json={
            "question_number": 1,
            "duration": 30,
            "pin": "7788",
            "user_id": test_user["id"],
            "subject_id": subject.id,
            "group_ids": [first["id"], second["id"]],
            "is_active": False,
        },
    )

    assert response.status_code == 201, response.text
    quiz_id = response.json()["id"]

    links = (
        await async_db.execute(select(QuizGroup.group_id).where(QuizGroup.quiz_id == quiz_id))
    ).scalars().all()
    assert sorted(links) == sorted([first["id"], second["id"]])

    # `quizzes.group_id` ham toʻldiriladi — unga kodning koʻp joyi tayanadi.
    quiz = (await async_db.execute(select(Quiz).where(Quiz.id == quiz_id))).scalar_one()
    assert quiz.group_id in (first["id"], second["id"])


@pytest.mark.asyncio
async def test_single_group_still_works(
    auth_client, async_db, make_group, make_subject, test_faculty, test_user
):
    """Eski mijoz `group_id` yuboradi — u ham roʻyxatga tushadi."""
    group = await make_group("SINGLE-1", test_faculty["id"])
    subject = await make_subject("Bitta guruh fani")

    response = await auth_client.post(
        "/quiz/",
        json={
            "question_number": 1,
            "duration": 30,
            "pin": "7799",
            "user_id": test_user["id"],
            "subject_id": subject.id,
            "group_id": group["id"],
            "is_active": False,
        },
    )

    assert response.status_code == 201, response.text
    links = (
        await async_db.execute(
            select(QuizGroup.group_id).where(QuizGroup.quiz_id == response.json()["id"])
        )
    ).scalars().all()
    assert links == [group["id"]]


# ───────────────── Koʻp guruhli testga kirish huquqi ──────────────────


async def _make_student(async_db, *, user_id: int, group_id: int, number: str):
    """Talaba yozuvi.

    `Student` da majburiy maydonlar koʻp va fikstira yoʻq, shuning uchun
    shu yerda toʻldiriladi: kirish tekshiruvi aynan bu yozuvga qaraydi.
    """
    from datetime import date

    from app.modules.auth.model import Student

    student = Student(
        user_id=user_id,
        group_id=group_id,
        first_name="Talaba",
        last_name="Sinov",
        third_name="Sinovovich",
        full_name="Talaba Sinov",
        student_id_number=number,
        image_path="students/sinov.jpg",
        birth_date=date(2005, 1, 1),
        gender="male",
        university="NDKTU",
        specialty="Sinov",
        student_status="active",
        education_form="Kunduzgi",
        education_type="Bakalavr",
        payment_form="Kontrakt",
        education_lang="uz",
        faculty="Sinov",
        level="1-kurs",
        semester="1",
        address="Navoiy",
        avg_gpa=0.0,
    )
    async_db.add(student)
    await async_db.commit()
    await async_db.refresh(student)
    return student


async def _make_quiz_with_question(async_db, *, subject_id: int, user_id: int, pin: str, group_id=None):
    from app.modules.quiz.model import Question, QuizQuestion

    quiz = Quiz(
        title="Koʻp guruh testi",
        subject_id=subject_id,
        group_id=group_id,
        question_number=1,
        duration=30,
        is_active=True,
        pin=pin,
        proctoring_mode="standard",
    )
    async_db.add(quiz)
    await async_db.commit()
    await async_db.refresh(quiz)

    question = Question(
        text="2+2?",
        option_a="4",
        option_b="3",
        option_c="2",
        option_d="1",
        correct_option="a",
        subject_id=subject_id,
        user_id=user_id,
    )
    async_db.add(question)
    await async_db.commit()
    await async_db.refresh(question)
    async_db.add(QuizQuestion(quiz_id=quiz.id, question_id=question.id))
    await async_db.commit()
    return quiz.id


@pytest.mark.asyncio
async def test_student_of_any_linked_group_can_start(
    auth_client, async_db, make_group, make_subject, test_faculty, test_user
):
    """Testga biriktirilgan ikkala guruh talabasi ham kira oladi."""
    first = await make_group("ACL-1", test_faculty["id"])
    second = await make_group("ACL-2", test_faculty["id"])
    subject = await make_subject("Kirish huquqi fani")

    quiz_id = await _make_quiz_with_question(
        async_db, subject_id=subject.id, user_id=test_user["id"], pin="1212", group_id=first["id"]
    )
    async_db.add_all(
        [
            QuizGroup(quiz_id=quiz_id, group_id=first["id"]),
            QuizGroup(quiz_id=quiz_id, group_id=second["id"]),
        ]
    )
    await async_db.commit()
    # Testda so'rov bilan bitta sessiya ishlatiladi: `quiz` allaqachon
    # identity map da va `quiz_groups` bo'sh holda yuklangan. Haqiqiy
    # so'rovda sessiya yangi, shuning uchun bu faqat test ehtiyoji.
    async_db.expire_all()

    # Talaba IKKINCHI guruhda: `quizzes.group_id` unga mos kelmaydi,
    # roʻyxatda esa bor — demak kirishi kerak.
    await _make_student(async_db, user_id=test_user["id"], group_id=second["id"], number="ACL0002")

    response = await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz_id, "pin": "1212"})
    assert response.status_code == 200, response.text


@pytest.mark.asyncio
async def test_student_of_other_group_is_rejected(
    auth_client, async_db, make_group, make_subject, test_faculty, test_user
):
    """Uchinchi guruh talabasi kira olmaydi."""
    first = await make_group("ACL-3", test_faculty["id"])
    second = await make_group("ACL-4", test_faculty["id"])
    outsider = await make_group("ACL-5", test_faculty["id"])
    subject = await make_subject("Yopiq fan")

    quiz_id = await _make_quiz_with_question(
        async_db, subject_id=subject.id, user_id=test_user["id"], pin="1313", group_id=first["id"]
    )
    async_db.add_all(
        [
            QuizGroup(quiz_id=quiz_id, group_id=first["id"]),
            QuizGroup(quiz_id=quiz_id, group_id=second["id"]),
        ]
    )
    await async_db.commit()
    async_db.expire_all()
    await _make_student(async_db, user_id=test_user["id"], group_id=outsider["id"], number="ACL0005")

    response = await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz_id, "pin": "1313"})
    assert response.status_code == 403, response.text


@pytest.mark.asyncio
async def test_old_quiz_without_links_falls_back_to_group_id(
    auth_client, async_db, make_group, make_subject, test_faculty, test_user
):
    """`quiz_groups` boʻsh boʻlsa — eski `quizzes.group_id` ishlaydi.

    Migratsiya mavjud qatorlarni koʻchiradi, lekin zaxira yoʻl
    qolmasa, koʻchirilmagan yoki qoʻlda qoʻyilgan test hech kimni
    kiritmay qoʻyardi.
    """
    own = await make_group("OLD-1", test_faculty["id"])
    other = await make_group("OLD-2", test_faculty["id"])
    subject = await make_subject("Eski fan")

    quiz_id = await _make_quiz_with_question(
        async_db, subject_id=subject.id, user_id=test_user["id"], pin="1414", group_id=own["id"]
    )
    await _make_student(async_db, user_id=test_user["id"], group_id=other["id"], number="OLD0002")

    response = await auth_client.post("/quiz_process/start_quiz", json={"quiz_id": quiz_id, "pin": "1414"})
    assert response.status_code == 403, response.text


@pytest.mark.asyncio
async def test_multi_group_quiz_is_visible_in_list(
    auth_client, async_db, make_group, make_subject, test_faculty, test_user
):
    """Ikkinchi guruh talabasi testni ROʻYXATDA ham koʻradi.

    Kirish huquqi va koʻrinish alohida joyda tekshiriladi: roʻyxat faqat
    `quizzes.group_id` ga qarasa, talaba testni topa olmay, faqat PIN
    orqali kirardi — yaʼni amalda uni koʻrmasdi.
    """
    first = await make_group("LIST-1", test_faculty["id"])
    second = await make_group("LIST-2", test_faculty["id"])
    subject = await make_subject("Roʻyxat fani")

    quiz_id = await _make_quiz_with_question(
        async_db, subject_id=subject.id, user_id=test_user["id"], pin="1515", group_id=first["id"]
    )
    async_db.add_all(
        [
            QuizGroup(quiz_id=quiz_id, group_id=first["id"]),
            QuizGroup(quiz_id=quiz_id, group_id=second["id"]),
        ]
    )
    await async_db.commit()

    # Guruh boʻyicha filtr: `quizzes.group_id` ikkinchi guruhga teng emas.
    response = await auth_client.get("/quiz/", params={"group_id": second["id"], "limit": 50})
    assert response.status_code == 200, response.text
    body = response.json()
    assert quiz_id in [q["id"] for q in body["quizzes"]]
    assert body["total"] == 1, "bitta test ikki marta sanalmasligi kerak"

    # Javobda barcha guruhlar boʻlishi kerak — tahrirlash oynasi shuni oʻqiydi.
    row = next(q for q in body["quizzes"] if q["id"] == quiz_id)
    assert sorted(row["group_ids"]) == sorted([first["id"], second["id"]])


# ───────────── Xizmat testida maʼruzachi — tuzuvchining oʻzi ─────────────


@pytest.mark.asyncio
async def test_service_quiz_lecturer_defaults_to_creator(
    auth_client, async_db, make_group, test_faculty, test_user
):
    """Maʼruzachi koʻrsatilmasa, xizmat testi tuzuvchiga yoziladi.

    Xizmat fani hech kimga biriktirilmaydi va savollarni odatda uni
    tuzgan odam yuklaydi. Maʼruzachisiz test savolsiz qolardi: ular
    aynan `Question.user_id == lecturer_id` boʻyicha yigʻiladi.
    """
    group = await make_group("SVC-LECT", test_faculty["id"])
    service = Subject(name="Maʼruzachisiz xizmat fani", is_countable=False)
    async_db.add(service)
    await async_db.commit()
    await async_db.refresh(service)

    response = await auth_client.post(
        "/quiz/",
        json={
            "question_number": 1,
            "duration": 30,
            "pin": "2323",
            "subject_id": service.id,
            "group_ids": [group["id"]],
            "is_active": False,
        },
    )

    assert response.status_code == 201, response.text
    assert response.json()["lecturer_id"] == test_user["id"]


@pytest.mark.asyncio
async def test_service_quiz_keeps_explicit_lecturer(
    auth_client, async_db, make_group, make_teacher, test_faculty, test_kafedra
):
    """Aniq koʻrsatilgan maʼruzachi almashtirilmaydi.

    Savollarni boshqa odam yuklagan boʻlishi mumkin — admin uni ataylab
    tanlaydi va bu tanlov saqlanishi kerak.
    """
    group = await make_group("SVC-LECT2", test_faculty["id"])
    teacher = await make_teacher("svc_lecturer", test_kafedra["id"])
    service = Subject(name="Boshqa maʼruzachili xizmat fani", is_countable=False)
    async_db.add(service)
    await async_db.commit()
    await async_db.refresh(service)

    response = await auth_client.post(
        "/quiz/",
        json={
            "question_number": 1,
            "duration": 30,
            "pin": "2424",
            "user_id": teacher["user_id"],
            "subject_id": service.id,
            "group_ids": [group["id"]],
            "is_active": False,
        },
    )

    assert response.status_code == 201, response.text
    assert response.json()["lecturer_id"] == teacher["user_id"]


@pytest.mark.asyncio
async def test_normal_subject_has_no_lecturer_fallback(
    auth_client, async_db, make_group, make_subject, test_faculty
):
    """Oddiy fanda bunday almashtirish YOʻQ.

    Aks holda tashkilotchi maʼruzachini koʻrsatishni unutganda, test
    jimgina uning nomiga yozilib, savollari oʻqituvchi bankidan emas,
    tashkilotchinikidan (yaʼni boʻsh) yigʻilardi.
    """
    group = await make_group("NORM-LECT", test_faculty["id"])
    subject = await make_subject("Oddiy fan — maʼruzachisiz")

    response = await auth_client.post(
        "/quiz/",
        json={
            "question_number": 1,
            "duration": 30,
            "pin": "2525",
            "subject_id": subject.id,
            "group_ids": [group["id"]],
            "is_active": False,
        },
    )

    assert response.status_code == 201, response.text
    assert response.json()["lecturer_id"] is None
