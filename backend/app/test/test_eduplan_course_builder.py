"""Yuklamadan kurs yigʻish.

Qoida bitta: kurs — «fan + semestr + oʻqituvchi + mashgʻulot turi» toʻrtligi.
Har bir tur alohida kurs, va uning egasi — oʻsha turni olib boradigan
oʻqituvchining oʻzi. Oʻqituvchining oʻsha turdagi barcha guruhlari bitta
kursga birlashadi.
"""

import pytest
import pytest_asyncio

from app.modules.integration.eduplan.course_builder import eduplan_course_builder


@pytest_asyncio.fixture
async def workload(async_db, test_faculty, test_kafedra):
    """Ikki oʻqituvchi, bitta fan, uch guruh.

    Maʼruzani birinchi oʻqituvchi ikkita guruhga oʻqiydi va birinchi guruhda
    amaliyot ham olib boradi. Ikkinchi oʻqituvchida faqat amaliyot bor —
    ikkinchi va uchinchi guruhlarda. Yaʼni uchta kurs chiqishi kerak.
    """
    from core.utils.password_hash import hash_password

    from app.modules.auth.model import Teacher, TeacherAssignment, User
    from app.modules.organization_structure.model import Group
    from app.modules.quiz.model import Subject

    subject = Subject(name="Fizika", kafedra_id=test_kafedra["id"], external_id="900", external_source="eduplan")
    async_db.add(subject)

    groups = [Group(name=name, faculty_id=test_faculty["id"]) for name in ("101-23", "102-23", "103-23")]
    async_db.add_all(groups)

    teachers = []
    for index, full_name in enumerate(("Lektor Aliyev", "Assistent Valiyev")):
        user = User(username=f"wl_teacher_{index}", password=hash_password("password123"), is_active=True)
        async_db.add(user)
        await async_db.flush()
        teacher = Teacher(
            user_id=user.id,
            kafedra_id=test_kafedra["id"],
            last_name=full_name.split()[1],
            first_name=full_name.split()[0],
            third_name="-",
            full_name=full_name,
        )
        async_db.add(teacher)
        teachers.append(teacher)

    await async_db.flush()
    lecturer, assistant = teachers

    async_db.add_all(
        [
            TeacherAssignment(
                teacher_id=lecturer.id,
                subject_id=subject.id,
                group_id=groups[0].id,
                load_types=["lecture", "practice"],
                semester_type="Kuzgi",
                academic_year_id=1,
                external_source="eduplan",
            ),
            TeacherAssignment(
                teacher_id=lecturer.id,
                subject_id=subject.id,
                group_id=groups[1].id,
                load_types=["lecture"],
                semester_type="Kuzgi",
                academic_year_id=1,
                external_source="eduplan",
            ),
            TeacherAssignment(
                teacher_id=assistant.id,
                subject_id=subject.id,
                group_id=groups[1].id,
                load_types=["practice"],
                semester_type="Kuzgi",
                academic_year_id=1,
                external_source="eduplan",
            ),
            TeacherAssignment(
                teacher_id=assistant.id,
                subject_id=subject.id,
                group_id=groups[2].id,
                load_types=["practice"],
                semester_type="Kuzgi",
                academic_year_id=1,
                external_source="eduplan",
            ),
        ]
    )
    await async_db.commit()

    return {
        "subject_id": subject.id,
        "group_ids": [g.id for g in groups],
        "lecturer_user_id": lecturer.user_id,
        "assistant_user_id": assistant.user_id,
    }


def _plan(preview, course_type: str, teacher_user_id: int):
    return next(
        p
        for p in preview.plans
        if p.course_type == course_type and p.teacher_user_id == teacher_user_id
    )


@pytest.mark.asyncio
async def test_lecturer_owns_one_course_over_all_their_groups(async_db, workload):
    """Ikki guruhga maʼruza — ikkita emas, bitta kurs.

    EPOS oqimni shunday tashkil qiladi; har guruhga alohida kurs yasalsa,
    oʻqituvchi bir xil darsni ikki joyda yuritishga majbur boʻlardi.
    """
    preview = await eduplan_course_builder.build(async_db)

    plan = _plan(preview, "lecture", workload["lecturer_user_id"])
    assert plan.group_ids == workload["group_ids"][:2]
    assert plan.semester_number == 1


@pytest.mark.asyncio
async def test_each_load_type_becomes_its_own_course(async_db, workload):
    """Maʼruza va amaliyot — bir oʻqituvchida ham alohida kurslar.

    Soatlar oʻquv rejada aynan shu kesimda boʻlinadi, jurnal ham shunday
    yuritiladi. Bitta kursga qoʻshilsa, ular bir-birining davomatiga
    aralashib ketardi.
    """
    preview = await eduplan_course_builder.build(async_db)

    assert len(preview.plans) == 3
    assert preview.by_type == {"lecture": 1, "practice": 2}
    assert _plan(preview, "practice", workload["lecturer_user_id"]).group_ids == workload["group_ids"][:1]


@pytest.mark.asyncio
async def test_practice_teacher_owns_their_course(async_db, workload):
    """Amaliyot oʻqituvchisi — mehmon emas, egasi.

    Ilgari u maʼruzachining kursida assistent boʻlardi: oʻz yuklamasi bor
    odam birovning kursida jurnal yurita olmasdi.
    """
    preview = await eduplan_course_builder.build(async_db)

    plan = _plan(preview, "practice", workload["assistant_user_id"])
    assert plan.group_ids == workload["group_ids"][1:]


@pytest.mark.asyncio
async def test_apply_creates_the_course_with_groups_and_teachers(async_db, workload):
    from sqlalchemy import select

    from app.modules.course.model import Course, CourseGroup, CourseTeacher

    result = await eduplan_course_builder.apply(async_db)
    assert result.created == 3

    courses = {course.course_type: course for course in (await async_db.scalars(select(Course))).all()}
    lecture = courses["lecture"]
    assert lecture.external_source == "eduplan"
    assert lecture.teacher_id == workload["lecturer_user_id"]
    assert lecture.semester_number == 1
    assert lecture.kafedra_id is not None
    assert lecture.is_active is True
    assert lecture.synced_at is not None

    lecture_groups = sorted(
        (await async_db.scalars(select(CourseGroup.group_id).where(CourseGroup.course_id == lecture.id))).all()
    )
    assert lecture_groups == sorted(workload["group_ids"][:2])

    # Assistent degan rol qolmadi: har kim oʻz kursining asosiy oʻqituvchisi.
    roles = {row.role for row in (await async_db.scalars(select(CourseTeacher))).all()}
    assert roles == {"main"}


@pytest.mark.asyncio
async def test_course_name_carries_the_type(async_db, workload):
    """Nomda tur boʻlishi shart — roʻyxatda kurslar aynan shu bilan farqlanadi."""
    from sqlalchemy import select

    from app.modules.course.model import Course

    await eduplan_course_builder.apply(async_db)

    names = {course.course_type: course.name for course in (await async_db.scalars(select(Course))).all()}
    assert "ma'ruza" in names["lecture"]
    assert "amaliyot" in names["practice"]


@pytest.mark.asyncio
async def test_apply_twice_does_not_duplicate(async_db, workload):
    """Takroriy prognda kurs qayta yaratilmaydi.

    Sinxronizatsiya kunda bir marta ishlaydi; barqaror ``external_id``
    boʻlmasa, har prognda oʻsha kurslar yangidan paydo boʻlaverardi.
    """
    from sqlalchemy import func, select

    from app.modules.course.model import Course

    await eduplan_course_builder.apply(async_db)
    second = await eduplan_course_builder.apply(async_db)

    assert second.created == 0
    assert (await async_db.scalar(select(func.count()).select_from(Course))) == 3


@pytest.mark.asyncio
async def test_vanished_workload_is_archived_only_when_asked(async_db, workload):
    """Yuklamadan yoʻqolgan kurs oʻchirilmaydi va oʻzicha arxivga ham tushmaydi.

    Kursga darslar, davomat jurnali va baholar bogʻlangan, shuning uchun
    qarorni admin qabul qiladi.
    """
    from sqlalchemy import select

    from app.modules.auth.model import TeacherAssignment
    from app.modules.course.model import Course

    await eduplan_course_builder.apply(async_db)

    # EPOS'da amaliyot yuklamasi olib tashlandi: ikkita kurs egasiz qoldi.
    for assignment in (await async_db.scalars(select(TeacherAssignment))).all():
        remaining = [t for t in (assignment.load_types or []) if t != "practice"]
        if remaining:
            assignment.load_types = remaining
        else:
            await async_db.delete(assignment)
    await async_db.commit()

    preview = await eduplan_course_builder.build(async_db)
    assert preview.summary["to_archive"] == 2
    assert preview.archive_blocked is False
    assert all(row.lesson_count == 0 for row in preview.archive)

    without_archive = await eduplan_course_builder.apply(async_db)
    assert without_archive.archived == 0
    assert (await async_db.scalars(select(Course.is_active))).all() == [True, True, True]

    with_archive = await eduplan_course_builder.apply(async_db, archive=True)
    assert with_archive.archived == 2
    active = (await async_db.scalars(select(Course.course_type).where(Course.is_active.is_(True)))).all()
    assert list(active) == ["lecture"]


@pytest.mark.asyncio
async def test_archived_course_returns_instead_of_a_second_one(async_db, workload):
    """Yuklamaga qaytgan kurs arxivdan tiklanadi, yangisi yaratilmaydi.

    Aks holda oʻqituvchi oʻzining oʻtgan yarim yillik jurnalini boy berardi.
    """
    from sqlalchemy import func, select, update

    from app.modules.course.model import Course

    await eduplan_course_builder.apply(async_db)
    await async_db.execute(update(Course).where(Course.course_type == "lecture").values(is_active=False))
    await async_db.commit()

    preview = await eduplan_course_builder.build(async_db)
    assert preview.summary["to_restore"] == 1
    assert preview.summary["to_create"] == 0

    result = await eduplan_course_builder.apply(async_db)
    assert result.restored == 1
    assert (await async_db.scalar(select(func.count()).select_from(Course))) == 3
    assert (await async_db.scalar(select(func.count()).select_from(Course).where(Course.is_active.is_(False)))) == 0


@pytest.mark.asyncio
async def test_both_semesters_leave_the_number_empty(async_db, workload):
    """«Bahorgi, Kuzgi» — birlashtirilgan qiymat, unga bitta raqam mos kelmaydi.

    Yuklama satrlari yigʻilganda ``semester_type`` vergul bilan qoʻshiladi.
    Bunday holatda semestrni taxmin qilgandan koʻra boʻsh qoldirgan maʼqul.
    """
    from sqlalchemy import update

    from app.modules.auth.model import TeacherAssignment

    await async_db.execute(update(TeacherAssignment).values(semester_type="Bahorgi, Kuzgi"))
    await async_db.commit()

    preview = await eduplan_course_builder.build(async_db)

    assert preview.plans[0].semester_number is None
    assert preview.plans[0].semester_type == "Bahorgi, Kuzgi"
