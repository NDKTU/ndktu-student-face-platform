"""Talabaning bosh sahifasi uchun statistika.

Hammasi bitta soʻrovda va talabaning oʻz doirasida:

- **Kurslar** — guruhi biriktirilganlari (`course_groups`), uy vazifalari
  roʻyxatidagi qoida bilan bir xil.
- **Darslar** — guruhga koʻrinadiganlari (`visible_to_group`): guruhi
  koʻrsatilgan dars yoki butun kursning darsi.
- **Davomat** — `lesson_attendances.student_id`, jurnal formulasi bilan
  (`excused` maxrajga kirmaydi).
- **Testlar** — talabaning oʻz yakunlangan urinishlari.

`students` jadvalida yozuvi yoʻq hisob (HEMIS hali bogʻlanmagan) xato emas,
boʻsh dashboard oladi: bosh sahifa ochilmay qolmasligi kerak.
"""

from datetime import datetime

from sqlalchemy import and_, exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.mixins.time_stamp_mixin import utcnow_naive
from app.core.schemas import TASHKENT_TZ
from app.core.utils.lesson_scope import visible_to_group
from app.modules.auth.model import Student, User
from app.modules.course.model import (
    Course,
    CourseGroup,
    Homework,
    HomeworkSubmission,
    Lesson,
    LessonAttendance,
)
from app.modules.organization_structure.model import Group
from app.modules.quiz.model import Quiz, Result, Subject

from .schemas import (
    StudentDashboardAttendance,
    StudentDashboardAttendanceCourse,
    StudentDashboardGrades,
    StudentDashboardHomework,
    StudentDashboardLesson,
    StudentDashboardProfile,
    StudentDashboardResponse,
    StudentDashboardResult,
    StudentDashboardTotals,
)

UPCOMING_LIMIT = 5
HOMEWORK_LIMIT = 5
RESULTS_LIMIT = 5

# Talaba ishni yuborgan: qoralama (`draft`) hali topshirilmagan hisoblanadi.
_HANDED_IN = ("submitted", "late", "graded")


def _percent(present: int, late: int, absent: int) -> float | None:
    counted = present + late + absent
    if counted == 0:
        return None
    return round((present + late) * 100 / counted, 1)


async def build_student_dashboard(session: AsyncSession, user: User) -> StudentDashboardResponse:
    student = (
        await session.execute(select(Student).where(Student.user_id == user.id))
    ).scalar_one_or_none()

    profile = StudentDashboardProfile()
    totals = StudentDashboardTotals()
    attendance = StudentDashboardAttendance()
    grades = StudentDashboardGrades()
    upcoming: list[StudentDashboardLesson] = []
    homeworks: list[StudentDashboardHomework] = []
    group_id = student.group_id if student else None

    if student:
        profile = StudentDashboardProfile(
            group_id=student.group_id,
            level=student.level,
            semester=student.semester,
            specialty=student.specialty,
            faculty=student.faculty,
            avg_gpa=student.avg_gpa,
        )
        if group_id:
            profile.group_name = await session.scalar(select(Group.name).where(Group.id == group_id))

    course_ids: list[int] = []
    if group_id:
        course_ids = list(
            await session.scalars(select(CourseGroup.course_id).where(CourseGroup.group_id == group_id))
        )
    totals.courses = len(course_ids)

    today = datetime.now(TASHKENT_TZ).date()
    now = utcnow_naive()

    # ── Darslar ────────────────────────────────────────────────────────────
    if group_id:
        visible = and_(visible_to_group(group_id), Lesson.date >= today)
        totals.upcoming_lessons = (await session.scalar(select(func.count(Lesson.id)).where(visible))) or 0
        rows = await session.execute(
            select(Lesson, Course.name)
            .join(Course, Course.id == Lesson.course_id)
            .where(visible)
            .order_by(Lesson.date, Lesson.id)
            .limit(UPCOMING_LIMIT)
        )
        upcoming = [
            StudentDashboardLesson(
                id=lesson.id,
                topic=lesson.topic,
                date=lesson.date.isoformat(),
                lesson_type=lesson.lesson_type,
                course_id=lesson.course_id,
                course_name=course_name,
            )
            for lesson, course_name in rows
        ]

    # ── Uy vazifalari ──────────────────────────────────────────────────────
    if course_ids:
        handed_in = exists().where(
            HomeworkSubmission.homework_id == Homework.id,
            HomeworkSubmission.user_id == user.id,
            HomeworkSubmission.status.in_(_HANDED_IN),
        )
        in_scope = Homework.course_id.in_(course_ids)

        totals.homeworks_pending, totals.homeworks_missed = (
            await session.execute(
                select(
                    func.count(Homework.id).filter(Homework.deadline >= now),
                    func.count(Homework.id).filter(Homework.deadline < now),
                ).where(in_scope, ~handed_in)
            )
        ).one()

        rows = await session.execute(
            select(HomeworkSubmission.status, func.count(HomeworkSubmission.id))
            .join(Homework, Homework.id == HomeworkSubmission.homework_id)
            .where(in_scope, HomeworkSubmission.user_id == user.id)
            .group_by(HomeworkSubmission.status)
        )
        for status_value, count in rows:
            if status_value in ("submitted", "late"):
                totals.homeworks_submitted += count
            elif status_value == "graded":
                totals.homeworks_graded += count

        homework_percent = await session.scalar(
            select(func.avg(HomeworkSubmission.grade * 100.0 / Homework.max_grade))
            .select_from(HomeworkSubmission)
            .join(Homework, Homework.id == HomeworkSubmission.homework_id)
            .where(
                in_scope,
                HomeworkSubmission.user_id == user.id,
                HomeworkSubmission.status == "graded",
                HomeworkSubmission.grade.isnot(None),
                Homework.max_grade > 0,
            )
        )
        grades.homework_percent = round(float(homework_percent), 1) if homework_percent is not None else None

        rows = await session.execute(
            select(Homework, Course.name)
            .join(Course, Course.id == Homework.course_id)
            .where(in_scope, ~handed_in, Homework.deadline >= now)
            .order_by(Homework.deadline)
            .limit(HOMEWORK_LIMIT)
        )
        homeworks = [
            StudentDashboardHomework(
                id=hw.id,
                title=hw.title,
                deadline=hw.deadline,
                course_id=hw.course_id,
                course_name=course_name,
                lesson_id=hw.lesson_id,
            )
            for hw, course_name in rows
        ]

    # ── Davomat ────────────────────────────────────────────────────────────
    if student:
        rows = await session.execute(
            select(Course.id, Course.name, LessonAttendance.status, func.count(LessonAttendance.id))
            .join(Lesson, Lesson.id == LessonAttendance.lesson_id)
            .join(Course, Course.id == Lesson.course_id)
            .where(LessonAttendance.student_id == student.id)
            .group_by(Course.id, Course.name, LessonAttendance.status)
        )
        per_course: dict[int, tuple[str, dict[str, int]]] = {}
        for course_id, course_name, status_value, count in rows:
            if status_value in ("present", "late", "absent", "excused"):
                setattr(attendance, status_value, getattr(attendance, status_value) + count)
            per_course.setdefault(course_id, (course_name, {}))[1][status_value] = count
        attendance.percent = _percent(attendance.present, attendance.late, attendance.absent)
        attendance.courses = sorted(
            (
                StudentDashboardAttendanceCourse(
                    course_id=course_id,
                    course_name=name,
                    percent=_percent(c.get("present", 0), c.get("late", 0), c.get("absent", 0)),
                    absent=c.get("absent", 0),
                )
                for course_id, (name, c) in per_course.items()
            ),
            key=lambda c: c.course_name,
        )

    # ── Testlar ────────────────────────────────────────────────────────────
    completed = and_(Result.user_id == user.id, Result.status == "completed")
    rows = await session.execute(select(Result.grade, func.count(Result.id)).where(completed).group_by(Result.grade))
    grade_sum = 0
    graded = 0
    for grade, count in rows:
        totals.quizzes_taken += count
        if grade in (2, 3, 4, 5):
            setattr(grades, f"grade_{grade}", count)
            grade_sum += grade * count
            graded += count
    grades.avg_grade = round(grade_sum / graded, 2) if graded else None

    rows = await session.execute(
        select(Result, Quiz.title, Subject.name)
        .outerjoin(Quiz, Quiz.id == Result.quiz_id)
        .outerjoin(Subject, Subject.id == Result.subject_id)
        .where(completed)
        .order_by(func.coalesce(Result.finished_at, Result.created_at).desc(), Result.id.desc())
        .limit(RESULTS_LIMIT)
    )
    recent = [
        StudentDashboardResult(
            id=result.id,
            quiz_title=quiz_title,
            subject_name=subject_name,
            grade=result.grade,
            correct_answers=result.correct_answers,
            wrong_answers=result.wrong_answers,
            finished_at=result.finished_at or result.created_at,
        )
        for result, quiz_title, subject_name in rows
    ]

    return StudentDashboardResponse(
        profile=profile,
        totals=totals,
        attendance=attendance,
        grades=grades,
        upcoming_lessons=upcoming,
        homeworks=homeworks,
        recent_results=recent,
    )
