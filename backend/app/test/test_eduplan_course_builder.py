"""Yuklamadan kurs yigʻish.

Qoida bitta: kursning egasi — maʼruza oʻqiydigan oʻqituvchi. Uning oʻsha fan
va semestrdagi guruhlari bitta kursga birlashadi, oʻsha guruhlarda amaliyot
olib boradiganlar assistent boʻladi. Maʼruzachisi yoʻq guruhdan kurs
yasalmaydi — aks holda tasodifiy oʻqituvchi kursning egasiga aylanardi.
"""

import pytest
import pytest_asyncio

from app.modules.integration.eduplan.course_builder import eduplan_course_builder


@pytest_asyncio.fixture
async def workload(async_db, test_faculty, test_kafedra):
    """Ikki oʻqituvchi, bitta fan, uch guruh.

    Maʼruzani birinchi oʻqituvchi ikkita guruhga oʻqiydi, ikkinchisi oʻsha
    guruhlarning birida amaliyot olib boradi. Uchinchi guruhda faqat amaliyot
    bor — maʼruzachisi yoʻq.
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


@pytest.mark.asyncio
async def test_lecturer_owns_one_course_over_all_their_groups(async_db, workload):
    """Ikki guruhga maʼruza — ikkita emas, bitta kurs.

    EPOS oqimni shunday tashkil qiladi; har guruhga alohida kurs yasalsa,
    oʻqituvchi bir xil darsni ikki joyda yuritishga majbur boʻlardi.
    """
    preview = await eduplan_course_builder.build(async_db)

    assert len(preview.plans) == 1
    plan = preview.plans[0]
    assert plan.teacher_user_id == workload["lecturer_user_id"]
    assert plan.group_ids == workload["group_ids"][:2]
    assert plan.semester_number == 1


@pytest.mark.asyncio
async def test_practice_teacher_becomes_an_assistant(async_db, workload):
    preview = await eduplan_course_builder.build(async_db)

    assert preview.plans[0].assistant_user_ids == [workload["assistant_user_id"]]


@pytest.mark.asyncio
async def test_group_without_a_lecturer_is_reported_not_created(async_db, workload):
    """Uchinchi guruh kursga aylanmaydi, lekin koʻzdan ham qochmaydi."""
    preview = await eduplan_course_builder.build(async_db)

    assert len(preview.skipped) == 1
    assert preview.skipped[0].group_names == ["103-23"]
    assert preview.summary["to_create"] == 1


@pytest.mark.asyncio
async def test_apply_creates_the_course_with_groups_and_teachers(async_db, workload):
    from sqlalchemy import select

    from app.modules.course.model import Course, CourseGroup, CourseTeacher

    result = await eduplan_course_builder.apply(async_db)
    assert result.created == 1

    course = (await async_db.scalars(select(Course))).one()
    assert course.external_source == "eduplan"
    assert course.teacher_id == workload["lecturer_user_id"]
    assert course.semester_number == 1
    assert course.kafedra_id is not None

    group_ids = sorted((await async_db.scalars(select(CourseGroup.group_id))).all())
    assert group_ids == sorted(workload["group_ids"][:2])

    roles = {row.user_id: row.role for row in (await async_db.scalars(select(CourseTeacher))).all()}
    assert roles == {
        workload["lecturer_user_id"]: "main",
        workload["assistant_user_id"]: "assistant",
    }


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
    assert (await async_db.scalar(select(func.count()).select_from(Course))) == 1


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
