"""Darsdan tuzilgan test talabaga koʻrinishi.

Muammo qanday chiqqan. Oʻqituvchi dars sahifasidan test tuzadi; dars esa
butun kursniki boʻlishi mumkin (`lessons.group_id` boʻsh — «kursning
barcha guruhlari»). Bunday darsda guruh yoʻq, demak testga ham guruh
yozilmaydi. Talabalar roʻyxati esa faqat `quizzes.group_id` ga qaraydi —
natijada test «Test ishlash» sahifasida umuman koʻrinmaydi.

Eng yomoni: test aslida FAOL va PIN bilan ochiladi, yaʼni oʻqituvchi
uni tuzgan deb hisoblaydi, talaba esa topa olmaydi.
"""

from datetime import date

import pytest
import pytest_asyncio

from app.modules.auth.model import Student
from app.modules.course.model import Course, CourseGroup, Lesson
from app.modules.quiz.model import Question, Quiz, QuizQuestion


@pytest_asyncio.fixture
async def student_client(async_client, async_db, make_group, test_faculty):
    """Guruhga biriktirilgan haqiqiy talaba va uning mijozi.

    Rol ataylab `student`, `Admin` emas: roʻyxatdagi talaba filtri
    aynan rol boʻyicha yoqiladi (`is_student = not is_admin and ...`),
    yaʼni admin rolida muammo umuman koʻrinmasdi.
    """
    from core.utils.password_hash import hash_password

    from app.modules.auth.model import Permission, Role, RolePermission, User, UserRole

    group = await make_group("LESSON-VIS-1", test_faculty["id"])
    other_group = await make_group("LESSON-VIS-2", test_faculty["id"])

    role = Role(name="student")
    async_db.add(role)
    await async_db.flush()
    # Talabaning ikkala yoʻli: `/quiz/` va «Test ishlash» sahifasidagi
    # `/quiz/active`. Ruxsatlar odatda ilova koʻtarilganda seed qilinadi,
    # test bazasida esa qoʻlda qoʻyiladi.
    for name in ("read:quiz", "read:active_quiz", "quiz_process:start_quiz"):
        permission = Permission(name=name)
        async_db.add(permission)
        await async_db.flush()
        async_db.add(RolePermission(role_id=role.id, permission_id=permission.id))

    user = User(username="lesson_student", password=hash_password("password123"), is_active=True)
    async_db.add(user)
    await async_db.flush()
    async_db.add(UserRole(user_id=user.id, role_id=role.id))

    student = Student(
        user_id=user.id,
        group_id=group["id"],
        first_name="Talaba",
        last_name="Darsli",
        third_name="D",
        full_name="Talaba Darsli",
        student_id_number="LV0001",
        image_path="students/lv.jpg",
        birth_date=date(2005, 1, 1),
        gender="male",
        university="NDKTU",
        specialty="TJA",
        student_status="active",
        education_form="Kechki",
        education_type="Bakalavr",
        payment_form="Kontrakt",
        education_lang="uz",
        faculty="Energo-mexanika",
        level="2-kurs",
        semester="3",
        address="Navoiy",
        avg_gpa=3.0,
    )
    async_db.add(student)
    await async_db.commit()

    token = (
        await async_client.post(
            "/user/login", json={"username": "lesson_student", "password": "password123"}
        )
    ).json()["access_token"]
    async_client.headers.update({"Authorization": f"Bearer {token}"})
    return {
        "client": async_client,
        "user_id": user.id,
        "group_id": group["id"],
        "other_group_id": other_group["id"],
    }


async def _course_with_lesson(
    async_db, *, subject_id: int, teacher_user_id: int, group_id: int, teacher_subject_id: int
):
    """Kurs + unga biriktirilgan guruh + GURUHSIZ dars.

    Aynan shu holat serverda uchradi: kurs oqimga tegishli, dars esa
    hamma guruhlar uchun bitta.
    """
    course = Course(name="Kompyuter tizimlari", subject_id=subject_id, teacher_id=teacher_user_id)
    async_db.add(course)
    await async_db.commit()
    await async_db.refresh(course)

    async_db.add(CourseGroup(course_id=course.id, group_id=group_id))

    lesson = Lesson(
        teacher_subject_id=teacher_subject_id,
        group_id=None,  # ← kursning barcha guruhlari
        course_id=course.id,
        topic="Operatsion tizimlar",
        date=date(2026, 9, 30),
    )
    async_db.add(lesson)
    await async_db.commit()
    await async_db.refresh(lesson)
    return course, lesson


@pytest_asyncio.fixture
async def teacher_subject_row(async_db, make_teacher, make_subject, test_kafedra):
    """`Lesson.teacher_subject_id` majburiy — shuning uchun juftlik kerak."""
    from app.modules.auth.model import TeacherSubject

    teacher = await make_teacher("lesson_teacher", test_kafedra["id"])
    subject = await make_subject("Kompyuter tizimlari fani")
    link = TeacherSubject(teacher_id=teacher["id"], subject_id=subject.id)
    async_db.add(link)
    await async_db.commit()
    await async_db.refresh(link)
    return {"teacher": teacher, "subject": subject, "link": link}


async def _quiz_for_lesson(async_db, *, lesson, subject_id: int, user_id: int, pin: str):
    """Darsga bogʻlangan, GURUHSIZ faol test — bekend darsdan shunday tuzadi."""
    quiz = Quiz(
        title="30.09.2026",
        subject_id=subject_id,
        group_id=None,  # ← darsda guruh boʻlmagani uchun
        lesson_id=lesson.id,
        question_number=1,
        duration=10,
        is_active=True,
        pin=pin,
        proctoring_mode="standard",
        lecturer_id=user_id,
    )
    async_db.add(quiz)
    await async_db.commit()
    await async_db.refresh(quiz)

    question = Question(
        text="Savol",
        option_a="a",
        option_b="b",
        option_c="c",
        option_d="d",
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
async def test_student_sees_quiz_from_course_wide_lesson(
    student_client, async_db, teacher_subject_row
):
    """Kurs guruhidagi talaba guruhsiz dars testini KOʻRADI."""
    data = student_client
    _, lesson = await _course_with_lesson(
        async_db,
        subject_id=teacher_subject_row["subject"].id,
        teacher_user_id=data["user_id"],
        group_id=data["group_id"],
        teacher_subject_id=teacher_subject_row["link"].id,
    )
    quiz_id = await _quiz_for_lesson(
        async_db,
        lesson=lesson,
        subject_id=teacher_subject_row["subject"].id,
        user_id=data["user_id"],
        pin="1111",
    )
    async_db.expire_all()

    response = await data["client"].get("/quiz/", params={"limit": 50})

    assert response.status_code == 200, response.text
    body = response.json()
    assert quiz_id in [q["id"] for q in body["quizzes"]], "test roʻyxatda boʻlishi kerak"
    assert body["total"] == 1


@pytest.mark.asyncio
async def test_student_of_other_course_does_not_see_it(
    student_client, async_db, teacher_subject_row
):
    """Kursga kirmagan guruh talabasi bunday testni koʻrmaydi.

    Guruhsiz test «hammaga ochiq» degani emas: u aynan kursning
    guruhlariga tegishli.
    """
    data = student_client
    _, lesson = await _course_with_lesson(
        async_db,
        subject_id=teacher_subject_row["subject"].id,
        teacher_user_id=data["user_id"],
        group_id=data["other_group_id"],  # ← talabaning guruhi EMAS
        teacher_subject_id=teacher_subject_row["link"].id,
    )
    await _quiz_for_lesson(
        async_db,
        lesson=lesson,
        subject_id=teacher_subject_row["subject"].id,
        user_id=data["user_id"],
        pin="2222",
    )
    async_db.expire_all()

    response = await data["client"].get("/quiz/", params={"limit": 50})

    assert response.status_code == 200, response.text
    assert response.json()["total"] == 0


@pytest.mark.asyncio
async def test_own_group_lesson_quiz_still_visible(
    student_client, async_db, teacher_subject_row
):
    """Guruh koʻrsatilgan eski testlar avvalgidek koʻrinadi."""
    data = student_client
    _, lesson = await _course_with_lesson(
        async_db,
        subject_id=teacher_subject_row["subject"].id,
        teacher_user_id=data["user_id"],
        group_id=data["group_id"],
        teacher_subject_id=teacher_subject_row["link"].id,
    )
    # Bu testda guruh aniq koʻrsatilgan — eski yoʻl.
    quiz = Quiz(
        title="Guruhli test",
        subject_id=teacher_subject_row["subject"].id,
        group_id=data["group_id"],
        lesson_id=lesson.id,
        question_number=1,
        duration=10,
        is_active=True,
        pin="3333",
        proctoring_mode="standard",
        lecturer_id=data["user_id"],
    )
    async_db.add(quiz)
    await async_db.commit()
    await async_db.refresh(quiz)
    async_db.expire_all()

    response = await data["client"].get("/quiz/", params={"limit": 50})

    assert response.status_code == 200, response.text
    assert quiz.id in [q["id"] for q in response.json()["quizzes"]]


@pytest.mark.asyncio
async def test_active_quiz_page_shows_it(student_client, async_db, teacher_subject_row):
    """«Test ishlash» sahifasi aynan `/quiz/active` dan oʻqiydi.

    Talaba muammoni oʻsha sahifada koʻradi, shuning uchun tekshiruv ham
    shu yoʻl boʻyicha: u `list_quizzes` ni `is_active=true` bilan
    chaqiradi.
    """
    data = student_client
    _, lesson = await _course_with_lesson(
        async_db,
        subject_id=teacher_subject_row["subject"].id,
        teacher_user_id=data["user_id"],
        group_id=data["group_id"],
        teacher_subject_id=teacher_subject_row["link"].id,
    )
    quiz_id = await _quiz_for_lesson(
        async_db,
        lesson=lesson,
        subject_id=teacher_subject_row["subject"].id,
        user_id=data["user_id"],
        pin="4444",
    )
    async_db.expire_all()

    response = await data["client"].get("/quiz/active", params={"limit": 50})

    assert response.status_code == 200, response.text
    assert quiz_id in [q["id"] for q in response.json()["quizzes"]]


@pytest.mark.asyncio
async def test_student_of_course_can_start_group_less_quiz(
    student_client, async_db, teacher_subject_row
):
    """Kurs guruhidagi talaba guruhsiz dars testini ishlay oladi."""
    data = student_client
    _, lesson = await _course_with_lesson(
        async_db,
        subject_id=teacher_subject_row["subject"].id,
        teacher_user_id=data["user_id"],
        group_id=data["group_id"],
        teacher_subject_id=teacher_subject_row["link"].id,
    )
    quiz_id = await _quiz_for_lesson(
        async_db,
        lesson=lesson,
        subject_id=teacher_subject_row["subject"].id,
        user_id=data["user_id"],
        pin="5555",
    )
    async_db.expire_all()

    response = await data["client"].post(
        "/quiz_process/start_quiz", json={"quiz_id": quiz_id, "pin": "5555"}
    )
    assert response.status_code == 200, response.text


@pytest.mark.asyncio
async def test_outsider_cannot_start_group_less_quiz(
    student_client, async_db, teacher_subject_row
):
    """Begona kurs talabasi PIN bilan ham kira olmaydi.

    Guruhsiz testda tekshiruv butunlay oʻtkazib yuborilgan edi: PIN
    bilgan istalgan talaba begona kursning testini ishlab, natijasi
    oʻsha fan jurnaliga tushardi.
    """
    data = student_client
    _, lesson = await _course_with_lesson(
        async_db,
        subject_id=teacher_subject_row["subject"].id,
        teacher_user_id=data["user_id"],
        group_id=data["other_group_id"],  # ← talaba bu kursda yoʻq
        teacher_subject_id=teacher_subject_row["link"].id,
    )
    quiz_id = await _quiz_for_lesson(
        async_db,
        lesson=lesson,
        subject_id=teacher_subject_row["subject"].id,
        user_id=data["user_id"],
        pin="6666",
    )
    async_db.expire_all()

    response = await data["client"].post(
        "/quiz_process/start_quiz", json={"quiz_id": quiz_id, "pin": "6666"}
    )
    assert response.status_code == 403, response.text
