"""Oʻqituvchining bosh sahifasi uchun statistika.

Hammasi bitta soʻrovda: frontend oʻnlab roʻyxat endpointlarini `limit=1`
bilan chaqirib `total` yigʻsa, har biri oʻz filtrini qoʻllardi va raqamlar
bir-biriga mos kelmasdi (masalan natijalar biriktirma boʻyicha, testlar esa
mualliflik boʻyicha).

Doira qoidalari:

- **Kurslar** — asosiy va assistent sifatida (`manageable_course_ids`).
- **Guruhlar** — `teacher_group` va kurslar orqali (`teacher_group_ids`),
  faqat faollari. Talabalar soni shu guruhlardagi `students` satrlari.
- **Darslar, uy vazifalari, davomat** — oʻqituvchining kurslari boʻyicha.
- **Testlar va natijalar** — oʻzi oʻtkazgan testlar (`quizzes.lecturer_id`).
  Guruh+fan biriktirmasi boʻyicha natijalar ataylab olinmagan: natija fanni
  emas, guruhni biladi va bitta natija guruhdagi hamma oʻqituvchiga tushib
  qolardi (xuddi shu sabab bilan «Reyting» oʻchirilgan).
"""

from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.mixins.time_stamp_mixin import utcnow_naive
from app.core.schemas import TASHKENT_TZ
from app.core.utils.course_access import manageable_course_ids
from app.core.utils.group_scope import teacher_group_ids
from app.modules.auth.model import Student, Teacher, TeacherSubject, User
from app.modules.course.model import (
    Course,
    Homework,
    HomeworkSubmission,
    Lesson,
    LessonAttendance,
)
from app.modules.organization_structure.model import Group
from app.modules.quiz.model import Question, Quiz, Result

from .schemas import (
    TeacherDashboardAttendance,
    TeacherDashboardAttendanceWeek,
    TeacherDashboardGrades,
    TeacherDashboardGroup,
    TeacherDashboardHomework,
    TeacherDashboardLesson,
    TeacherDashboardResponse,
    TeacherDashboardTotals,
)

UPCOMING_LIMIT = 6
HOMEWORK_LIMIT = 6
TREND_WEEKS = 8

# Talaba ishni topshirgan, oʻqituvchi hali baholamagan.
_TO_GRADE = ("submitted", "late")
_SUBMITTED = ("submitted", "late", "graded")


def _percent(present: int, late: int, absent: int) -> float | None:
    """Davomat jurnalidagi formula bilan bir xil: `excused` maxrajga kirmaydi."""
    counted = present + late + absent
    if counted == 0:
        return None
    return round((present + late) * 100 / counted, 1)


def _today() -> date:
    # Dars sanasi mahalliy sana: UTC boʻyicha yarim tundan keyingi besh soat
    # ichida «bugungi» darslar kechagi boʻlib qolardi.
    return datetime.now(TASHKENT_TZ).date()


async def build_teacher_dashboard(session: AsyncSession, user: User) -> TeacherDashboardResponse:
    courses_sq = await manageable_course_ids(session, user)
    course_ids = [row[0] for row in await session.execute(select(courses_sq))]

    today = _today()
    now = utcnow_naive()

    # ── Guruhlar va talabalar ──────────────────────────────────────────────
    scope_group_ids = await teacher_group_ids(session, user.id)
    groups = []
    if scope_group_ids:
        groups = list(
            (
                await session.execute(
                    select(Group)
                    .where(Group.id.in_(scope_group_ids), Group.is_active.is_(True))
                    .order_by(Group.name)
                )
            ).scalars()
        )
    group_ids = [g.id for g in groups]

    student_counts: dict[int, int] = {}
    if group_ids:
        rows = await session.execute(
            select(Student.group_id, func.count(Student.id))
            .where(Student.group_id.in_(group_ids))
            .group_by(Student.group_id)
        )
        student_counts = {group_id: count for group_id, count in rows}

    # ── Fanlar: biriktirma va kurslar ──────────────────────────────────────
    subject_ids = set(
        await session.scalars(
            select(TeacherSubject.subject_id)
            .join(Teacher, Teacher.id == TeacherSubject.teacher_id)
            .where(Teacher.user_id == user.id)
        )
    )
    if course_ids:
        subject_ids.update(
            await session.scalars(select(Course.subject_id).where(Course.id.in_(course_ids)))
        )
    subject_ids.discard(None)

    # ── Darslar ────────────────────────────────────────────────────────────
    lessons_total = 0
    lessons_upcoming = 0
    upcoming: list[TeacherDashboardLesson] = []
    if course_ids:
        lessons_total, lessons_upcoming = (
            await session.execute(
                select(
                    func.count(Lesson.id),
                    func.count(Lesson.id).filter(Lesson.date >= today),
                ).where(Lesson.course_id.in_(course_ids))
            )
        ).one()

        rows = await session.execute(
            select(Lesson, Course.name, Group.name)
            .join(Course, Course.id == Lesson.course_id)
            .outerjoin(Group, Group.id == Lesson.group_id)
            .where(Lesson.course_id.in_(course_ids), Lesson.date >= today)
            .order_by(Lesson.date, Lesson.id)
            .limit(UPCOMING_LIMIT)
        )
        upcoming = [
            TeacherDashboardLesson(
                id=lesson.id,
                topic=lesson.topic,
                date=lesson.date.isoformat(),
                lesson_type=lesson.lesson_type,
                course_id=lesson.course_id,
                course_name=course_name,
                group_id=lesson.group_id,
                group_name=group_name,
            )
            for lesson, course_name, group_name in rows
        ]

    # ── Uy vazifalari ──────────────────────────────────────────────────────
    active_homeworks = 0
    to_grade_total = 0
    homeworks: list[TeacherDashboardHomework] = []
    if course_ids:
        active_homeworks = (
            await session.scalar(
                select(func.count(Homework.id)).where(
                    Homework.course_id.in_(course_ids), Homework.deadline >= now
                )
            )
        ) or 0
        to_grade_total = (
            await session.scalar(
                select(func.count(HomeworkSubmission.id))
                .join(Homework, Homework.id == HomeworkSubmission.homework_id)
                .where(
                    Homework.course_id.in_(course_ids),
                    HomeworkSubmission.status.in_(_TO_GRADE),
                )
            )
        ) or 0

        submitted = func.count(HomeworkSubmission.id).filter(HomeworkSubmission.status.in_(_SUBMITTED))
        to_grade = func.count(HomeworkSubmission.id).filter(HomeworkSubmission.status.in_(_TO_GRADE))
        # Muddati oʻtmagan yoki baholanishi kutilayotgan ishi borlari:
        # muddati oʻtib, hammasi baholangan vazifa endi eʼtibor talab qilmaydi.
        rows = await session.execute(
            select(Homework, Course.name, submitted, to_grade)
            .join(Course, Course.id == Homework.course_id)
            .outerjoin(HomeworkSubmission, HomeworkSubmission.homework_id == Homework.id)
            .where(Homework.course_id.in_(course_ids))
            .group_by(Homework.id, Course.name)
            .having((Homework.deadline >= now) | (to_grade > 0))
            .order_by(to_grade.desc(), Homework.deadline)
            .limit(HOMEWORK_LIMIT)
        )
        homeworks = [
            TeacherDashboardHomework(
                id=hw.id,
                title=hw.title,
                deadline=hw.deadline,
                course_id=hw.course_id,
                course_name=course_name,
                submitted=submitted_count,
                to_grade=to_grade_count,
            )
            for hw, course_name, submitted_count, to_grade_count in rows
        ]

    # ── Davomat ────────────────────────────────────────────────────────────
    attendance = TeacherDashboardAttendance()
    group_attendance: dict[int, dict[str, int]] = {}
    trend: list[TeacherDashboardAttendanceWeek] = []
    if course_ids:
        rows = await session.execute(
            select(LessonAttendance.group_id, LessonAttendance.status, func.count(LessonAttendance.id))
            .join(Lesson, Lesson.id == LessonAttendance.lesson_id)
            .where(Lesson.course_id.in_(course_ids))
            .group_by(LessonAttendance.group_id, LessonAttendance.status)
        )
        for group_id, status_value, count in rows:
            if status_value in ("present", "late", "absent", "excused"):
                setattr(attendance, status_value, getattr(attendance, status_value) + count)
            if group_id is not None:
                bucket = group_attendance.setdefault(group_id, {})
                bucket[status_value] = bucket.get(status_value, 0) + count
        attendance.percent = _percent(attendance.present, attendance.late, attendance.absent)

        # Oxirgi haftalar: dushanbadan boshlanadi, boʻsh hafta ham koʻrsatiladi —
        # aks holda diagrammada tanaffus koʻrinmay qolardi.
        this_monday = today - timedelta(days=today.weekday())
        first_monday = this_monday - timedelta(weeks=TREND_WEEKS - 1)
        week = func.date_trunc("week", Lesson.date).label("week")
        rows = await session.execute(
            select(week, LessonAttendance.status, func.count(LessonAttendance.id))
            .join(Lesson, Lesson.id == LessonAttendance.lesson_id)
            .where(
                Lesson.course_id.in_(course_ids),
                Lesson.date >= first_monday,
                Lesson.date <= today,
            )
            .group_by(week, LessonAttendance.status)
        )
        weeks: dict[date, dict[str, int]] = {}
        for week_start, status_value, count in rows:
            key = week_start.date() if isinstance(week_start, datetime) else week_start
            weeks.setdefault(key, {})[status_value] = count
        for i in range(TREND_WEEKS):
            monday = first_monday + timedelta(weeks=i)
            counts = weeks.get(monday, {})
            present, late, absent = counts.get("present", 0), counts.get("late", 0), counts.get("absent", 0)
            trend.append(
                TeacherDashboardAttendanceWeek(
                    week_start=monday.isoformat(),
                    present=present,
                    late=late,
                    absent=absent,
                    percent=_percent(present, late, absent),
                )
            )

    # ── Testlar va natijalar ───────────────────────────────────────────────
    quizzes_total, quizzes_active = (
        await session.execute(
            select(
                func.count(Quiz.id),
                func.count(Quiz.id).filter(Quiz.is_active.is_(True)),
            ).where(Quiz.lecturer_id == user.id)
        )
    ).one()

    questions_total = (
        await session.scalar(
            select(func.count(Question.id)).where(
                Question.user_id == user.id,
                Question.is_latest.is_(True),
            )
        )
    ) or 0

    own_results = (
        select(Result)
        .join(Quiz, Quiz.id == Result.quiz_id)
        .where(Quiz.lecturer_id == user.id, Result.status == "completed")
        .subquery()
    )
    grades = TeacherDashboardGrades()
    results_total = 0
    rows = await session.execute(
        select(own_results.c.grade, func.count()).group_by(own_results.c.grade)
    )
    grade_sum = 0
    graded = 0
    for grade, count in rows:
        results_total += count
        if grade in (2, 3, 4, 5):
            setattr(grades, f"grade_{grade}", count)
            grade_sum += grade * count
            graded += count
    grades.avg_grade = round(grade_sum / graded, 2) if graded else None
    grades.cheating = (
        await session.scalar(
            select(func.count()).select_from(own_results).where(own_results.c.cheating_detected.is_(True))
        )
    ) or 0

    group_grades: dict[int, tuple[float | None, int]] = {}
    if group_ids:
        rows = await session.execute(
            select(own_results.c.group_id, func.avg(own_results.c.grade), func.count())
            .where(own_results.c.group_id.in_(group_ids))
            .group_by(own_results.c.group_id)
        )
        group_grades = {
            group_id: (round(float(avg), 2) if avg is not None else None, count)
            for group_id, avg, count in rows
        }

    group_items = []
    for g in groups:
        att = group_attendance.get(g.id, {})
        avg_grade, results_count = group_grades.get(g.id, (None, 0))
        group_items.append(
            TeacherDashboardGroup(
                id=g.id,
                name=g.name,
                course=g.course,
                student_count=student_counts.get(g.id, 0),
                attendance_percent=_percent(att.get("present", 0), att.get("late", 0), att.get("absent", 0)),
                avg_grade=avg_grade,
                results=results_count,
            )
        )

    return TeacherDashboardResponse(
        totals=TeacherDashboardTotals(
            courses=len(course_ids),
            groups=len(groups),
            students=sum(student_counts.values()),
            subjects=len(subject_ids),
            lessons=lessons_total,
            upcoming_lessons=lessons_upcoming,
            active_homeworks=active_homeworks,
            submissions_to_grade=to_grade_total,
            quizzes=quizzes_total,
            active_quizzes=quizzes_active,
            questions=questions_total,
            results=results_total,
        ),
        attendance=attendance,
        attendance_trend=trend,
        grades=grades,
        groups=group_items,
        upcoming_lessons=upcoming,
        homeworks=homeworks,
    )
