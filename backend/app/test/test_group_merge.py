"""Takrorlangan guruhlarni birlashtirish.

EPOS guruhning ``external_id`` sini almashtirsa, zerkalo uni tanimay yangi
qator yaratadi va eskisi talabalari bilan yonida qolaveradi. Shundan keyin
HEMIS'dan talaba importi ishlamay qoladi: nom boʻyicha bogʻlashda ikkita bir
xil nomzod chiqadi va sopostavlenie toʻgʻri qiladi — taxmin qilmaydi.
"""

from datetime import date, datetime, timedelta

import pytest
import pytest_asyncio

from app.modules.organization_structure.group.merge import group_merge_service

ESKI = datetime(2026, 9, 1, 15, 43)
YANGI = ESKI + timedelta(days=8)


@pytest_asyncio.fixture
async def duplicates(async_db, test_faculty):
    """Bitta guruhning ikki nusxasi: eskisida talabalar, yangisi boʻsh."""
    from app.core.utils.password_hash import hash_password
    from app.modules.auth.model import Student, User
    from app.modules.organization_structure.model import Group

    stale = Group(
        name="107A-24 ENM",
        faculty_id=test_faculty["id"],
        external_id="99",
        external_source="eduplan",
        synced_at=ESKI,
    )
    live = Group(
        name="107a-24  enm",
        faculty_id=test_faculty["id"],
        external_id="1263",
        external_source="eduplan",
        synced_at=YANGI,
    )
    async_db.add_all([stale, live])
    await async_db.flush()

    user = User(username="dup_student", password=hash_password("password123"), is_active=True)
    async_db.add(user)
    await async_db.flush()
    async_db.add(
        Student(
            user_id=user.id,
            group_id=stale.id,
            first_name="Dup",
            last_name="Student",
            third_name="Test",
            full_name="Dup Student Test",
            student_id_number="DUP-001",
            image_path="",
            birth_date=date(2004, 1, 1),
            phone="",
            gender="male",
            university="NDKTU",
            specialty="Test",
            student_status="active",
            education_form="full_time",
            education_type="bachelor",
            payment_form="grant",
            education_lang="uz",
            faculty="Test",
            level="1",
            semester="1",
            address="Test",
            avg_gpa=0,
        )
    )
    await async_db.commit()
    return {"stale_id": stale.id, "live_id": live.id, "faculty_id": test_faculty["id"]}


@pytest.mark.asyncio
async def test_the_copy_the_last_sync_touched_is_kept(async_db, duplicates):
    """Tirik nusxa — ``synced_at`` yangirogʻi.

    Zerkalo faqat EPOS'da hali bor satrni yangilaydi, demak eskirgan
    ``synced_at`` — «EPOS bu qatorni endi bilmaydi» degani.
    """
    preview = await group_merge_service.preview(async_db)

    assert preview.summary["clusters"] == 1
    cluster = preview.clusters[0]
    assert cluster.keep.group_id == duplicates["live_id"]
    assert [row.group_id for row in cluster.merge] == [duplicates["stale_id"]]
    # Admin nimani koʻchirayotganini koʻrishi kerak.
    assert cluster.merge[0].students == 1
    assert preview.summary["students_to_move"] == 1


@pytest.mark.asyncio
async def test_merge_moves_students_and_archives_the_stale_copy(async_db, duplicates):
    from sqlalchemy import select

    from app.modules.auth.model import Student
    from app.modules.organization_structure.model import Group

    result = await group_merge_service.apply(async_db)
    assert result.clusters == 1
    assert result.archived == 1
    assert result.moved["students"] == 1

    student_group = await async_db.scalar(select(Student.group_id))
    assert student_group == duplicates["live_id"]

    # Oʻchirilmaydi: davomat va natijalar undagi `group_id` ga tayanadi.
    stale = await async_db.get(Group, duplicates["stale_id"])
    assert stale is not None
    assert stale.is_active is False
    live = await async_db.get(Group, duplicates["live_id"])
    assert live.is_active is True


@pytest.mark.asyncio
async def test_duplicate_link_is_dropped_not_duplicated(async_db, duplicates, test_subject):
    """Ikkala nusxa bir kursga biriktirilgan boʻlsa, koʻchirish unikal kalitga urilardi."""
    from sqlalchemy import select

    from app.modules.course.model import Course, CourseGroup

    course = Course(name="Fizika", subject_id=test_subject.id, teacher_id=1, course_type="lecture")
    async_db.add(course)
    await async_db.flush()
    async_db.add_all(
        [
            CourseGroup(course_id=course.id, group_id=duplicates["stale_id"]),
            CourseGroup(course_id=course.id, group_id=duplicates["live_id"]),
        ]
    )
    await async_db.commit()

    await group_merge_service.apply(async_db)

    rows = (await async_db.scalars(select(CourseGroup.group_id))).all()
    assert list(rows) == [duplicates["live_id"]]


@pytest.mark.asyncio
async def test_hemis_link_follows_the_surviving_copy(async_db, duplicates):
    from app.modules.organization_structure.model import Group

    stale = await async_db.get(Group, duplicates["stale_id"])
    stale.hemis_group_id = "962"
    stale.hemis_group_id_source = "manual"
    await async_db.commit()

    await group_merge_service.apply(async_db)

    live = await async_db.get(Group, duplicates["live_id"])
    assert live.hemis_group_id == "962"
    assert live.hemis_group_id_source == "manual"
    # Ikki qatorda bir xil HEMIS id qolsa, sopostavlenie yana chalkashardi.
    assert (await async_db.get(Group, duplicates["stale_id"])).hemis_group_id is None


@pytest.mark.asyncio
async def test_non_latin_suffix_is_a_different_group(async_db, test_faculty):
    """«107A-25 KM огр» va «107A-25 KM» — dublikat emas.

    ``group_match.normalize`` lotin boʻlmagan harfni tashlab yuboradi va bu
    ikkovini bitta qilib koʻrsatardi; bunday birlashtirish ikki guruhning
    talabalarini qoʻshib yuborardi.
    """
    from app.modules.organization_structure.model import Group

    async_db.add_all(
        [
            Group(name="107A-25 KM", faculty_id=test_faculty["id"], external_source="eduplan", synced_at=ESKI),
            Group(name="107A-25 KM огр", faculty_id=test_faculty["id"], external_source="eduplan", synced_at=YANGI),
        ]
    )
    await async_db.commit()

    preview = await group_merge_service.preview(async_db)
    assert preview.clusters == []


@pytest.mark.asyncio
async def test_same_name_in_another_faculty_is_not_a_duplicate(async_db, make_faculty, test_faculty, auth_client):
    from app.modules.organization_structure.model import Group

    # POST /faculty/ kommentga olindi (EPOS maʼlumoti) — qator repository orqali yaratiladi.
    other = await make_faculty("Mining Faculty")

    async_db.add_all(
        [
            Group(name="101-24 KM", faculty_id=test_faculty["id"], external_source="eduplan", synced_at=ESKI),
            Group(name="101-24 KM", faculty_id=other["id"], external_source="eduplan", synced_at=YANGI),
        ]
    )
    await async_db.commit()

    preview = await group_merge_service.preview(async_db)
    assert preview.clusters == []


@pytest.mark.asyncio
async def test_quizzes_and_results_move_too(async_db, duplicates, test_subject, test_user):
    """Testlar va natijalar ham koʻchadi — bu birlashtirishning eng qoʻrqinchli joyi.

    Prod bazasida eski nusxalarda 1626 test va 31313 natija osilib turgan edi:
    ular koʻchmasa yoki guruh oʻchirilsa, butun bir semestrning baholari
    koʻzdan yoʻqolardi.
    """
    from sqlalchemy import select

    from app.modules.quiz.model import Quiz, Result

    quiz = Quiz(
        title="Fizika nazorat",
        subject_id=test_subject.id,
        group_id=duplicates["stale_id"],
        lecturer_id=test_user["id"],
        question_number=10,
        duration=30,
        pin="1",
    )
    async_db.add(quiz)
    await async_db.flush()
    async_db.add(Result(user_id=test_user["id"], quiz_id=quiz.id, group_id=duplicates["stale_id"]))
    await async_db.commit()

    result = await group_merge_service.apply(async_db)
    assert result.moved["quizzes"] == 1
    assert result.moved["results"] == 1

    assert (await async_db.scalar(select(Quiz.group_id))) == duplicates["live_id"]
    assert (await async_db.scalar(select(Result.group_id))) == duplicates["live_id"]


@pytest.mark.asyncio
async def test_preview_counts_what_will_move(async_db, duplicates, test_subject, test_user):
    """Admin nimani koʻchirayotganini raqam bilan koʻrishi kerak.

    Ilgari kartada faqat talaba va kurs koʻrsatilardi, testlar bilan natijalar
    esa jimgina koʻchardi — shuning uchun «baholarni yoʻqotmaymizmi?» degan
    savol tugʻilgan edi.
    """
    from app.modules.quiz.model import Quiz

    async_db.add(
        Quiz(
            title="Fizika nazorat",
            subject_id=test_subject.id,
            group_id=duplicates["stale_id"],
            lecturer_id=test_user["id"],
            question_number=10,
            duration=30,
            pin="2",
        )
    )
    await async_db.commit()

    preview = await group_merge_service.preview(async_db)
    assert preview.summary["quizzes_to_move"] == 1
    assert preview.summary["students_to_move"] == 1
