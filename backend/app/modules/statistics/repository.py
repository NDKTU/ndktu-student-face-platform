import logging
import math
from collections import defaultdict
from typing import Any

from fastapi import HTTPException
from sqlalchemy import and_, case, distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.employee.model import Employee
from app.modules.faculty.model import Faculty
from app.modules.group.models.group import Group
from app.modules.kafedra.model import Kafedra
from app.modules.psychology.model import PsychologyMethod, PsychologyResult
from app.modules.question.model import Question
from app.modules.quiz.models.quiz import Quiz
from app.modules.quiz.models.quiz_questions import QuizQuestion
from app.modules.result.model import Result
from app.modules.course.model import Course, CourseGroup
from app.modules.student.model import Student
from app.modules.subject.models.subject import Subject
from app.modules.teacher.model import Teacher
from app.modules.user.models.user import User
from app.modules.user_answers.model import UserAnswers
from app.modules.yakuniy.model import Yakuniy

from .filters import StatsFilters, apply_date_filters, apply_result_filters
from .schemas import (
    CheatingByReasonResponse,
    CheatingByScopeResponse,
    CheatingOverviewResponse,
    CheatingReasonRow,
    CheatingScopeRow,
    DemographicResponse,
    DemographicRow,
    DiagnosisDistributionResponse,
    DiagnosisRow,
    DistractorRow,
    FacultyGroupStat,
    FacultyStatisticsResponse,
    FlaggedQuestionRow,
    FlaggedQuestionsResponse,
    GeneralStatisticsResponse,
    GpaBucketRow,
    GpaCorrelationResponse,
    GradeBucket,
    GradeDistributionResponse,
    GradeTrendPoint,
    GradeTrendResponse,
    GroupStatisticsResponse,
    KafedraStatsResponse,
    LeaderboardResponse,
    LeaderboardRow,
    PassRateResponse,
    ProctoringEvidenceResponse,
    ProctoringEvidenceRow,
    PsychologyCoverageResponse,
    PsychologyMethodCoverageRow,
    PsychologyMethodPopularityResponse,
    PsychologyMethodPopularityRow,
    PsychologyRiskGroupResponse,
    PsychologyRiskRow,
    PsychologyVsAcademicResponse,
    PsychologyVsAcademicRow,
    QuestionDifficultyResponse,
    QuestionDifficultyRow,
    QuestionDiscriminationResponse,
    QuestionDiscriminationRow,
    QuizDifficultyResponse,
    QuizDifficultyRow,
    QuizStatisticsResponse,
    QuizTimeStatsResponse,
    QuizTimeStatsRow,
    RepeatOffenderRow,
    RepeatOffendersResponse,
    SemesterProgressionResponse,
    SemesterRow,
    CourseStatsResponse,
    SubjectStatsResponse,
    SuspectQuizRow,
    SuspectQuizzesResponse,
    TeacherActivityPoint,
    TeacherActivityResponse,
    TeacherProctoringResponse,
    TeacherQuestionQualityResponse,
    TeacherStatisticsResponse,
    TopDistractorsResponse,
    TopGroupRow,
    TopStudentRow,
    UserStatisticsResponse,
    YakuniyBySubjectResponse,
    YakuniyDistributionResponse,
    YakuniySubjectRow,
    YakuniyVsQuizPoint,
    YakuniyVsQuizResponse,
)

logger = logging.getLogger(__name__)


PASS_THRESHOLD_DEFAULT = 60


def _grade_bucket_case(col) -> case:
    """SQL CASE that maps a 0-100 grade to one of 5 buckets."""
    return case(
        (col < 20, "0-20"),
        (col < 40, "20-40"),
        (col < 60, "40-60"),
        (col < 80, "60-80"),
        else_="80-100",
    )


def _empty_buckets() -> list[GradeBucket]:
    return [GradeBucket(bucket=b, count=0) for b in ("0-20", "20-40", "40-60", "60-80", "80-100")]


def _date_trunc(granularity: str, col):
    granularity = granularity if granularity in {"day", "week", "month"} else "day"
    return func.date_trunc(granularity, col)


def _safe_div(numerator: float, denominator: float) -> float:
    return float(numerator) / float(denominator) if denominator else 0.0


def _pearson(xs: list[float], ys: list[float]) -> float | None:
    n = len(xs)
    if n < 2:
        return None
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    num = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    den_x = math.sqrt(sum((x - mean_x) ** 2 for x in xs))
    den_y = math.sqrt(sum((y - mean_y) ** 2 for y in ys))
    if not den_x or not den_y:
        return None
    return num / (den_x * den_y)


def _diagnosis_label(diagnosis: Any) -> str:
    """Best-effort extraction of a human label out of the JSONB diagnosis blob."""
    if diagnosis is None:
        return "—"
    if isinstance(diagnosis, dict):
        for key in ("label", "category", "result", "name", "title"):
            if key in diagnosis and diagnosis[key] is not None:
                return str(diagnosis[key])
        return str(diagnosis)
    return str(diagnosis)


class StatisticsRepository:
    # ============================================================
    # Existing endpoints
    # ============================================================

    async def get_general_stats(self, session: AsyncSession) -> GeneralStatisticsResponse:
        students_stmt = select(func.count(distinct(Result.user_id)))
        total_students = (await session.execute(students_stmt)).scalar() or 0

        total_stmt = select(func.count(Result.id))
        total_quizzes = (await session.execute(total_stmt)).scalar() or 0

        avg_stmt = select(func.avg(Result.grade))
        avg_grade = (await session.execute(avg_stmt)).scalar() or 0.0

        return GeneralStatisticsResponse(
            total_students_tested=total_students,
            total_quizzes_taken=total_quizzes,
            system_average_grade=float(avg_grade),
        )

    async def get_quiz_stats(self, session: AsyncSession, quiz_id: int) -> QuizStatisticsResponse:
        q_res = await session.execute(select(Quiz).where(Quiz.id == quiz_id))
        quiz = q_res.scalar_one_or_none()
        if not quiz:
            raise HTTPException(status_code=404, detail="Quiz not found")

        stats_stmt = select(
            func.count(Result.id).label("times_taken"),
            func.avg(Result.grade).label("avg_grade"),
            func.max(Result.grade).label("max_grade"),
            func.min(Result.grade).label("min_grade"),
        ).where(Result.quiz_id == quiz_id)
        stats = (await session.execute(stats_stmt)).one()

        return QuizStatisticsResponse(
            quiz_id=quiz.id,
            title=quiz.title,
            times_taken=stats.times_taken or 0,
            average_grade=float(stats.avg_grade or 0.0),
            highest_grade=stats.max_grade or 0,
            lowest_grade=stats.min_grade or 0,
        )

    async def get_user_stats(self, session: AsyncSession, user_id: int) -> UserStatisticsResponse:
        user = (await session.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        stats_stmt = select(
            func.count(Result.id).label("quizzes_taken"),
            func.avg(Result.grade).label("avg_grade"),
        ).where(Result.user_id == user_id)
        stats = (await session.execute(stats_stmt)).one()

        return UserStatisticsResponse(
            user_id=user.id,
            full_name=user.username,
            quizzes_taken=stats.quizzes_taken or 0,
            average_grade=float(stats.avg_grade or 0.0),
        )

    async def get_faculty_stats(self, session: AsyncSession, faculty_id: int) -> FacultyStatisticsResponse:
        faculty = (await session.execute(select(Faculty).where(Faculty.id == faculty_id))).scalar_one_or_none()
        if not faculty:
            raise HTTPException(status_code=404, detail="Faculty not found")

        stats_stmt = (
            select(
                Group.id,
                Group.name,
                func.count(Result.id).label("total_results"),
                func.avg(Result.grade).label("avg_grade"),
            )
            .outerjoin(Result, Result.group_id == Group.id)
            .where(Group.faculty_id == faculty_id)
            .group_by(Group.id)
        )
        rows = (await session.execute(stats_stmt)).all()

        groups_data = []
        total_quizzes = 0
        for g_id, g_name, count, avg in rows:
            count = count or 0
            avg = float(avg or 0.0)
            groups_data.append(
                FacultyGroupStat(group_id=g_id, name=g_name, total_quizzes_taken=count, average_grade=avg)
            )
            total_quizzes += count

        weighted_sum = sum(g.average_grade * g.total_quizzes_taken for g in groups_data)
        faculty_avg = weighted_sum / total_quizzes if total_quizzes > 0 else 0.0

        return FacultyStatisticsResponse(
            faculty_id=faculty.id,
            name=faculty.name,
            total_quizzes_taken=total_quizzes,
            average_grade=faculty_avg,
            groups=groups_data,
        )

    async def get_group_stats(self, session: AsyncSession, group_id: int) -> GroupStatisticsResponse:
        group = (await session.execute(select(Group).where(Group.id == group_id))).scalar_one_or_none()
        if not group:
            raise HTTPException(status_code=404, detail="Group not found")

        stats_stmt = select(
            func.count(Result.id).label("total_results"),
            func.avg(Result.grade).label("avg_grade"),
        ).where(Result.group_id == group_id)
        stats = (await session.execute(stats_stmt)).one()

        return GroupStatisticsResponse(
            group_id=group.id,
            name=group.name,
            total_quizzes_taken=stats.total_results or 0,
            average_grade=float(stats.avg_grade or 0.0),
        )

    async def get_teacher_stats(self, session: AsyncSession, teacher_id: int) -> TeacherStatisticsResponse:
        teacher = (
            await session.execute(
                select(Teacher).options(selectinload(Teacher.employee)).where(Teacher.id == teacher_id)
            )
        ).scalar_one_or_none()
        if not teacher:
            raise HTTPException(status_code=404, detail="Teacher not found")

        stats_stmt = (
            select(
                func.count(Result.id).label("total_results"),
                func.avg(Result.grade).label("avg_grade"),
                func.count(distinct(Quiz.id)).label("quizzes_created"),
            )
            .join(Result.quiz)
            .join(Quiz.user)
            .join(User.employee)
            .join(Employee.teacher)
            .where(Teacher.id == teacher_id)
        )
        stats = (await session.execute(stats_stmt)).one()

        return TeacherStatisticsResponse(
            teacher_id=teacher.id,
            full_name=f"{teacher.employee.first_name} {teacher.employee.last_name}",
            total_quizzes_created=stats.quizzes_created or 0,
            total_results=stats.total_results or 0,
            average_grade=float(stats.avg_grade or 0.0),
        )

    # ============================================================
    # A. Quiz analytics
    # ============================================================

    async def get_grade_distribution(self, session: AsyncSession, filters: StatsFilters) -> GradeDistributionResponse:
        bucket = _grade_bucket_case(Result.grade).label("bucket")
        stmt = select(bucket, func.count(Result.id)).select_from(Result).group_by("bucket")
        stmt = apply_result_filters(stmt, filters)
        rows = (await session.execute(stmt)).all()

        counts = {row[0]: row[1] for row in rows}
        buckets = _empty_buckets()
        for b in buckets:
            b.count = counts.get(b.bucket, 0)
        return GradeDistributionResponse(total=sum(b.count for b in buckets), buckets=buckets)

    async def get_pass_rate(
        self, session: AsyncSession, filters: StatsFilters, threshold: int = PASS_THRESHOLD_DEFAULT
    ) -> PassRateResponse:
        passed_expr = func.sum(case((Result.grade >= threshold, 1), else_=0))
        stmt = select(func.count(Result.id), passed_expr).select_from(Result)
        stmt = apply_result_filters(stmt, filters)
        row = (await session.execute(stmt)).one()
        total = row[0] or 0
        passed = int(row[1] or 0)
        failed = total - passed
        return PassRateResponse(
            threshold=threshold,
            total=total,
            passed=passed,
            failed=failed,
            pass_rate_pct=100.0 * _safe_div(passed, total),
        )

    async def get_grade_trend(
        self, session: AsyncSession, filters: StatsFilters, granularity: str = "day"
    ) -> GradeTrendResponse:
        period = _date_trunc(granularity, Result.created_at).label("period")
        stmt = (
            select(period, func.count(Result.id), func.avg(Result.grade))
            .select_from(Result)
            .group_by("period")
            .order_by("period")
        )
        stmt = apply_result_filters(stmt, filters)
        rows = (await session.execute(stmt)).all()

        points = [
            GradeTrendPoint(
                period=p.isoformat() if hasattr(p, "isoformat") else str(p),
                attempts=int(c or 0),
                average_grade=float(a or 0.0),
            )
            for (p, c, a) in rows
        ]
        return GradeTrendResponse(granularity=granularity, points=points)

    async def get_quiz_difficulty_ranking(
        self, session: AsyncSession, filters: StatsFilters, limit: int = 20, order: str = "asc"
    ) -> QuizDifficultyResponse:
        avg_col = func.avg(Result.grade).label("avg_grade")
        stmt = (
            select(Quiz.id, Quiz.title, func.count(Result.id).label("attempts"), avg_col)
            .select_from(Result)
            .join(Quiz, Quiz.id == Result.quiz_id)
            .group_by(Quiz.id, Quiz.title)
        )
        stmt = apply_result_filters(stmt, filters)
        stmt = stmt.order_by(avg_col.asc() if order == "asc" else avg_col.desc()).limit(limit)
        rows = (await session.execute(stmt)).all()

        return QuizDifficultyResponse(
            order=order,
            rows=[
                QuizDifficultyRow(
                    quiz_id=r[0],
                    title=r[1],
                    attempts=int(r[2] or 0),
                    average_grade=float(r[3] or 0.0),
                )
                for r in rows
            ],
        )

    async def get_quiz_time_stats(self, session: AsyncSession, filters: StatsFilters) -> QuizTimeStatsResponse:
        stmt = (
            select(Quiz.id, Quiz.title, Quiz.duration, func.count(Result.id))
            .select_from(Result)
            .join(Quiz, Quiz.id == Result.quiz_id)
            .group_by(Quiz.id, Quiz.title, Quiz.duration)
            .order_by(func.count(Result.id).desc())
        )
        stmt = apply_result_filters(stmt, filters)
        rows = (await session.execute(stmt)).all()

        return QuizTimeStatsResponse(
            rows=[
                QuizTimeStatsRow(quiz_id=r[0], title=r[1], duration_minutes=int(r[2] or 0), attempts=int(r[3] or 0))
                for r in rows
            ]
        )

    # ============================================================
    # B. Item / question analysis
    # ============================================================

    async def get_question_difficulty(self, session: AsyncSession, quiz_id: int) -> QuestionDifficultyResponse:
        correct_expr = func.sum(case((UserAnswers.is_correct.is_(True), 1), else_=0)).label("correct_count")
        stmt = (
            select(
                Question.id,
                Question.text,
                func.count(UserAnswers.id).label("total"),
                correct_expr,
            )
            .select_from(UserAnswers)
            .join(Question, Question.id == UserAnswers.question_id)
            .where(UserAnswers.quiz_id == quiz_id)
            .group_by(Question.id, Question.text)
            .order_by(Question.id)
        )
        rows = (await session.execute(stmt)).all()

        result_rows = []
        for q_id, q_text, total, correct in rows:
            total = int(total or 0)
            correct = int(correct or 0)
            result_rows.append(
                QuestionDifficultyRow(
                    question_id=q_id,
                    text=q_text,
                    total_responses=total,
                    correct_count=correct,
                    correct_pct=100.0 * _safe_div(correct, total),
                )
            )

        return QuestionDifficultyResponse(quiz_id=quiz_id, rows=result_rows)

    async def get_question_discrimination(self, session: AsyncSession, quiz_id: int) -> QuestionDiscriminationResponse:
        # 1. Rank results for this quiz, take top 27% and bottom 27% by grade.
        result_rows = (
            await session.execute(
                select(Result.id, Result.user_id, Result.grade)
                .where(Result.quiz_id == quiz_id)
                .order_by(Result.grade.desc(), Result.id.asc())
            )
        ).all()

        n = len(result_rows)
        if n < 4:
            return QuestionDiscriminationResponse(quiz_id=quiz_id, sample_size=n, rows=[])

        cut = max(1, int(round(n * 0.27)))
        top_user_ids = {r[1] for r in result_rows[:cut] if r[1] is not None}
        bottom_user_ids = {r[1] for r in result_rows[-cut:] if r[1] is not None}

        # 2. For each question in the quiz, compute correct% within each cohort.
        question_rows = (
            await session.execute(
                select(Question.id, Question.text)
                .join(QuizQuestion, QuizQuestion.question_id == Question.id)
                .where(QuizQuestion.quiz_id == quiz_id)
            )
        ).all()

        rows_out: list[QuestionDiscriminationRow] = []
        for q_id, q_text in question_rows:
            top_stmt = select(
                func.count(UserAnswers.id),
                func.sum(case((UserAnswers.is_correct.is_(True), 1), else_=0)),
            ).where(
                and_(
                    UserAnswers.quiz_id == quiz_id,
                    UserAnswers.question_id == q_id,
                    UserAnswers.user_id.in_(top_user_ids) if top_user_ids else False,
                )
            )
            bot_stmt = select(
                func.count(UserAnswers.id),
                func.sum(case((UserAnswers.is_correct.is_(True), 1), else_=0)),
            ).where(
                and_(
                    UserAnswers.quiz_id == quiz_id,
                    UserAnswers.question_id == q_id,
                    UserAnswers.user_id.in_(bottom_user_ids) if bottom_user_ids else False,
                )
            )

            t_total, t_correct = (await session.execute(top_stmt)).one()
            b_total, b_correct = (await session.execute(bot_stmt)).one()
            top_pct = 100.0 * _safe_div(int(t_correct or 0), int(t_total or 0))
            bot_pct = 100.0 * _safe_div(int(b_correct or 0), int(b_total or 0))

            rows_out.append(
                QuestionDiscriminationRow(
                    question_id=q_id,
                    text=q_text,
                    top_correct_pct=top_pct,
                    bottom_correct_pct=bot_pct,
                    discrimination_index=(top_pct - bot_pct) / 100.0,
                )
            )

        return QuestionDiscriminationResponse(quiz_id=quiz_id, sample_size=n, rows=rows_out)

    async def get_top_distractors(
        self, session: AsyncSession, question_id: int, limit: int = 5
    ) -> TopDistractorsResponse:
        # Pull correct answer for context
        question = (await session.execute(select(Question).where(Question.id == question_id))).scalar_one_or_none()
        if not question:
            raise HTTPException(status_code=404, detail="Question not found")

        correct_stmt = (
            select(UserAnswers.correct_answer)
            .where(and_(UserAnswers.question_id == question_id, UserAnswers.correct_answer.is_not(None)))
            .limit(1)
        )
        correct_answer = (await session.execute(correct_stmt)).scalar_one_or_none()

        stmt = (
            select(UserAnswers.answer, func.count(UserAnswers.id))
            .where(and_(UserAnswers.question_id == question_id, UserAnswers.is_correct.is_(False)))
            .group_by(UserAnswers.answer)
            .order_by(func.count(UserAnswers.id).desc())
            .limit(limit)
        )
        rows = (await session.execute(stmt)).all()
        total_wrong = sum(c for _, c in rows) or 0

        return TopDistractorsResponse(
            question_id=question_id,
            correct_answer=correct_answer,
            rows=[
                DistractorRow(answer=a or "—", count=int(c or 0), pct=100.0 * _safe_div(c or 0, total_wrong))
                for a, c in rows
            ],
        )

    async def get_flagged_questions(self, session: AsyncSession, quiz_id: int) -> FlaggedQuestionsResponse:
        difficulty = await self.get_question_difficulty(session, quiz_id)
        flagged = []
        for row in difficulty.rows:
            if row.total_responses == 0:
                continue
            if row.correct_pct >= 95.0:
                flagged.append(
                    FlaggedQuestionRow(
                        question_id=row.question_id,
                        text=row.text,
                        correct_pct=row.correct_pct,
                        flag="too_easy",
                    )
                )
            elif row.correct_pct <= 10.0:
                flagged.append(
                    FlaggedQuestionRow(
                        question_id=row.question_id,
                        text=row.text,
                        correct_pct=row.correct_pct,
                        flag="too_hard",
                    )
                )
        return FlaggedQuestionsResponse(quiz_id=quiz_id, rows=flagged)

    # ============================================================
    # C. Proctoring / cheating
    # ============================================================

    async def get_cheating_overview(self, session: AsyncSession, filters: StatsFilters) -> CheatingOverviewResponse:
        cheat_expr = func.sum(case((Result.cheating_detected.is_(True), 1), else_=0))
        stmt = select(func.count(Result.id), cheat_expr).select_from(Result)
        stmt = apply_result_filters(stmt, filters)
        row = (await session.execute(stmt)).one()
        total = int(row[0] or 0)
        cheating = int(row[1] or 0)
        return CheatingOverviewResponse(
            total_attempts=total,
            cheating_attempts=cheating,
            cheating_rate_pct=100.0 * _safe_div(cheating, total),
        )

    async def get_cheating_by_reason(self, session: AsyncSession, filters: StatsFilters) -> CheatingByReasonResponse:
        stmt = (
            select(Result.reason_for_stop, func.count(Result.id))
            .select_from(Result)
            .where(Result.cheating_detected.is_(True))
            .group_by(Result.reason_for_stop)
            .order_by(func.count(Result.id).desc())
        )
        stmt = apply_result_filters(stmt, filters)
        rows = (await session.execute(stmt)).all()
        total = sum(c for _, c in rows) or 0
        return CheatingByReasonResponse(
            total_cheating=total,
            rows=[
                CheatingReasonRow(reason=r, count=int(c or 0), pct=100.0 * _safe_div(c or 0, total)) for r, c in rows
            ],
        )

    async def get_cheating_by_scope(
        self, session: AsyncSession, filters: StatsFilters, scope: str
    ) -> CheatingByScopeResponse:
        scope = scope.lower()
        cheat_expr = func.sum(case((Result.cheating_detected.is_(True), 1), else_=0))
        total_expr = func.count(Result.id)

        if scope == "faculty":
            stmt = (
                select(Faculty.id, Faculty.name, total_expr, cheat_expr)
                .select_from(Result)
                .join(Group, Group.id == Result.group_id)
                .join(Faculty, Faculty.id == Group.faculty_id)
                .group_by(Faculty.id, Faculty.name)
            )
        elif scope == "group":
            stmt = (
                select(Group.id, Group.name, total_expr, cheat_expr)
                .select_from(Result)
                .join(Group, Group.id == Result.group_id)
                .group_by(Group.id, Group.name)
            )
        elif scope == "subject":
            stmt = (
                select(Subject.id, Subject.name, total_expr, cheat_expr)
                .select_from(Result)
                .join(Subject, Subject.id == Result.subject_id)
                .group_by(Subject.id, Subject.name)
            )
        elif scope == "quiz":
            stmt = (
                select(Quiz.id, Quiz.title, total_expr, cheat_expr)
                .select_from(Result)
                .join(Quiz, Quiz.id == Result.quiz_id)
                .group_by(Quiz.id, Quiz.title)
            )
        else:
            raise HTTPException(status_code=400, detail="scope must be one of: faculty, group, subject, quiz")

        stmt = apply_result_filters(stmt, filters)
        rows = (await session.execute(stmt)).all()

        out_rows = []
        for s_id, s_name, total, cheating in rows:
            total = int(total or 0)
            cheating = int(cheating or 0)
            out_rows.append(
                CheatingScopeRow(
                    scope_id=s_id,
                    name=s_name,
                    total=total,
                    cheating=cheating,
                    cheating_rate_pct=100.0 * _safe_div(cheating, total),
                )
            )
        out_rows.sort(key=lambda r: r.cheating_rate_pct, reverse=True)
        return CheatingByScopeResponse(scope=scope, rows=out_rows)

    async def get_repeat_offenders(
        self, session: AsyncSession, filters: StatsFilters, min_count: int = 2
    ) -> RepeatOffendersResponse:
        stmt = (
            select(
                User.id,
                User.username,
                Group.name,
                func.count(Result.id).label("cheat_count"),
            )
            .select_from(Result)
            .join(User, User.id == Result.user_id)
            .outerjoin(Group, Group.id == Result.group_id)
            .where(Result.cheating_detected.is_(True))
            .group_by(User.id, User.username, Group.name)
            .having(func.count(Result.id) >= min_count)
            .order_by(func.count(Result.id).desc())
        )
        stmt = apply_result_filters(stmt, filters)
        rows = (await session.execute(stmt)).all()
        return RepeatOffendersResponse(
            min_count=min_count,
            rows=[
                RepeatOffenderRow(user_id=u_id, full_name=name, group_name=g_name, cheating_count=int(c or 0))
                for u_id, name, g_name, c in rows
            ],
        )

    async def get_suspect_quizzes(
        self, session: AsyncSession, filters: StatsFilters, threshold_pct: float = 20.0
    ) -> SuspectQuizzesResponse:
        cheat_expr = func.sum(case((Result.cheating_detected.is_(True), 1), else_=0))
        total_expr = func.count(Result.id)
        stmt = (
            select(Quiz.id, Quiz.title, total_expr, cheat_expr)
            .select_from(Result)
            .join(Quiz, Quiz.id == Result.quiz_id)
            .group_by(Quiz.id, Quiz.title)
        )
        stmt = apply_result_filters(stmt, filters)
        rows = (await session.execute(stmt)).all()

        out_rows = []
        for q_id, title, total, cheating in rows:
            total = int(total or 0)
            cheating = int(cheating or 0)
            rate = 100.0 * _safe_div(cheating, total)
            if rate >= threshold_pct:
                out_rows.append(
                    SuspectQuizRow(
                        quiz_id=q_id,
                        title=title,
                        attempts=total,
                        cheating_attempts=cheating,
                        cheating_rate_pct=rate,
                    )
                )
        out_rows.sort(key=lambda r: r.cheating_rate_pct, reverse=True)
        return SuspectQuizzesResponse(threshold_pct=threshold_pct, rows=out_rows)

    async def get_proctoring_evidence(self, session: AsyncSession, user_id: int) -> ProctoringEvidenceResponse:
        stmt = (
            select(
                Result.id,
                Result.quiz_id,
                Quiz.title,
                Result.cheating_image_url,
                Result.reason_for_stop,
                Result.created_at,
            )
            .select_from(Result)
            .outerjoin(Quiz, Quiz.id == Result.quiz_id)
            .where(and_(Result.user_id == user_id, Result.cheating_detected.is_(True)))
            .order_by(Result.created_at.desc())
        )
        rows = (await session.execute(stmt)).all()
        return ProctoringEvidenceResponse(
            user_id=user_id,
            rows=[
                ProctoringEvidenceRow(
                    result_id=r_id,
                    quiz_id=q_id,
                    quiz_title=title,
                    cheating_image_url=img,
                    reason_for_stop=reason,
                    created_at=created,
                )
                for r_id, q_id, title, img, reason, created in rows
            ],
        )

    # ============================================================
    # D. Organizational slices
    # ============================================================

    async def get_subject_stats(
        self, session: AsyncSession, subject_id: int, filters: StatsFilters
    ) -> SubjectStatsResponse:
        subject = (await session.execute(select(Subject).where(Subject.id == subject_id))).scalar_one_or_none()
        if not subject:
            raise HTTPException(status_code=404, detail="Subject not found")

        # Override the filter so the call always scopes to this subject.
        f = filters.model_copy(update={"subject_id": subject_id})

        # Aggregate header stats
        passed_expr = func.sum(case((Result.grade >= PASS_THRESHOLD_DEFAULT, 1), else_=0))
        agg_stmt = select(func.count(Result.id), func.avg(Result.grade), passed_expr).select_from(Result)
        agg_stmt = apply_result_filters(agg_stmt, f)
        total, avg, passed = (await session.execute(agg_stmt)).one()
        total = int(total or 0)
        passed = int(passed or 0)

        # Top groups
        group_stmt = (
            select(Group.id, Group.name, func.count(Result.id), func.avg(Result.grade))
            .select_from(Result)
            .join(Group, Group.id == Result.group_id)
            .group_by(Group.id, Group.name)
            .order_by(func.avg(Result.grade).desc())
            .limit(5)
        )
        group_stmt = apply_result_filters(group_stmt, f)
        top_groups = [
            TopGroupRow(group_id=g_id, name=g_name, attempts=int(c or 0), average_grade=float(a or 0.0))
            for g_id, g_name, c, a in (await session.execute(group_stmt)).all()
        ]

        # Top students
        student_stmt = (
            select(User.id, User.username, func.count(Result.id), func.avg(Result.grade))
            .select_from(Result)
            .join(User, User.id == Result.user_id)
            .group_by(User.id, User.username)
            .order_by(func.avg(Result.grade).desc())
            .limit(10)
        )
        student_stmt = apply_result_filters(student_stmt, f)
        top_students = [
            TopStudentRow(user_id=u_id, full_name=u_name, attempts=int(c or 0), average_grade=float(a or 0.0))
            for u_id, u_name, c, a in (await session.execute(student_stmt)).all()
        ]

        return SubjectStatsResponse(
            subject_id=subject.id,
            name=subject.name,
            attempts=total,
            average_grade=float(avg or 0.0),
            pass_rate_pct=100.0 * _safe_div(passed, total),
            top_groups=top_groups,
            top_students=top_students,
        )

    async def get_kafedra_stats(
        self, session: AsyncSession, kafedra_id: int, filters: StatsFilters
    ) -> KafedraStatsResponse:
        kafedra = (await session.execute(select(Kafedra).where(Kafedra.id == kafedra_id))).scalar_one_or_none()
        if not kafedra:
            raise HTTPException(status_code=404, detail="Kafedra not found")

        teacher_count = (
            await session.execute(select(func.count(Teacher.id)).where(Teacher.kafedra_id == kafedra_id))
        ).scalar() or 0

        quizzes_created = (
            await session.execute(
                select(func.count(distinct(Quiz.id)))
                .select_from(Quiz)
                .join(Employee, Employee.user_id == Quiz.user_id)
                .join(Teacher, Teacher.employee_id == Employee.id)
                .where(Teacher.kafedra_id == kafedra_id)
            )
        ).scalar() or 0

        f = filters.model_copy(update={"kafedra_id": kafedra_id})
        agg_stmt = select(func.count(Result.id), func.avg(Result.grade)).select_from(Result)
        agg_stmt = apply_result_filters(agg_stmt, f)
        attempts, avg = (await session.execute(agg_stmt)).one()

        return KafedraStatsResponse(
            kafedra_id=kafedra.id,
            name=kafedra.name,
            teacher_count=int(teacher_count or 0),
            quizzes_created=int(quizzes_created or 0),
            attempts=int(attempts or 0),
            average_grade=float(avg or 0.0),
        )

    async def get_course_stats(self, session: AsyncSession, course_id: int, filters: StatsFilters) -> CourseStatsResponse:
        course = (await session.execute(select(Course).where(Course.id == course_id))).scalar_one_or_none()
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")

        group_ids = [
            gid
            for (gid,) in (await session.execute(select(CourseGroup.group_id).where(CourseGroup.course_id == course_id))).all()
        ]

        attempts = 0
        avg = 0.0
        if group_ids:
            f = filters.model_copy()
            stmt = (
                select(func.count(Result.id), func.avg(Result.grade))
                .select_from(Result)
                .where(and_(Result.group_id.in_(group_ids), Result.subject_id == course.subject_id))
            )
            stmt = apply_result_filters(stmt, f)
            row = (await session.execute(stmt)).one()
            attempts = int(row[0] or 0)
            avg = float(row[1] or 0.0)

        return CourseStatsResponse(
            course_id=course.id,
            name=course.name,
            subject_id=course.subject_id,
            teacher_id=course.teacher_id,
            group_count=len(group_ids),
            attempts=attempts,
            average_grade=avg,
        )

    async def get_org_leaderboard(
        self, session: AsyncSession, level: str, filters: StatsFilters, limit: int = 20
    ) -> LeaderboardResponse:
        level = level.lower()
        if level == "faculty":
            stmt = (
                select(Faculty.id, Faculty.name, func.count(Result.id), func.avg(Result.grade))
                .select_from(Result)
                .join(Group, Group.id == Result.group_id)
                .join(Faculty, Faculty.id == Group.faculty_id)
                .group_by(Faculty.id, Faculty.name)
            )
        elif level == "group":
            stmt = (
                select(Group.id, Group.name, func.count(Result.id), func.avg(Result.grade))
                .select_from(Result)
                .join(Group, Group.id == Result.group_id)
                .group_by(Group.id, Group.name)
            )
        elif level == "subject":
            stmt = (
                select(Subject.id, Subject.name, func.count(Result.id), func.avg(Result.grade))
                .select_from(Result)
                .join(Subject, Subject.id == Result.subject_id)
                .group_by(Subject.id, Subject.name)
            )
        elif level == "teacher":
            stmt = (
                select(
                    Teacher.id,
                    Employee.full_name,
                    func.count(Result.id),
                    func.avg(Result.grade),
                )
                .select_from(Result)
                .join(Quiz, Quiz.id == Result.quiz_id)
                .join(Employee, Employee.user_id == Quiz.user_id)
                .join(Teacher, Teacher.employee_id == Employee.id)
                .group_by(Teacher.id, Employee.full_name)
            )
        else:
            raise HTTPException(status_code=400, detail="level must be one of: faculty, group, subject, teacher")

        stmt = apply_result_filters(stmt, filters)
        stmt = stmt.order_by(func.avg(Result.grade).desc()).limit(limit)
        rows = (await session.execute(stmt)).all()
        return LeaderboardResponse(
            level=level,
            rows=[
                LeaderboardRow(scope_id=r[0], name=r[1], attempts=int(r[2] or 0), average_grade=float(r[3] or 0.0))
                for r in rows
            ],
        )

    # ============================================================
    # E. Demographics
    # ============================================================

    async def _stats_by_student_column(
        self, session: AsyncSession, filters: StatsFilters, column, dimension: str
    ) -> DemographicResponse:
        passed_expr = func.sum(case((Result.grade >= PASS_THRESHOLD_DEFAULT, 1), else_=0))
        stmt = (
            select(column.label("category"), func.count(Result.id), func.avg(Result.grade), passed_expr)
            .select_from(Result)
            .join(Student, Student.user_id == Result.user_id)
            .group_by(column)
        )
        stmt = apply_result_filters(stmt, filters)
        rows = (await session.execute(stmt)).all()

        out_rows = []
        for cat, attempts, avg, passed in rows:
            attempts = int(attempts or 0)
            passed = int(passed or 0)
            out_rows.append(
                DemographicRow(
                    category=str(cat) if cat is not None else "—",
                    attempts=attempts,
                    average_grade=float(avg or 0.0),
                    pass_rate_pct=100.0 * _safe_div(passed, attempts),
                )
            )
        out_rows.sort(key=lambda r: r.attempts, reverse=True)
        return DemographicResponse(dimension=dimension, rows=out_rows)

    async def get_stats_by_gender(self, session: AsyncSession, filters: StatsFilters) -> DemographicResponse:
        return await self._stats_by_student_column(session, filters, Student.gender, "gender")

    async def get_stats_by_education_form(self, session: AsyncSession, filters: StatsFilters) -> DemographicResponse:
        return await self._stats_by_student_column(session, filters, Student.education_form, "education_form")

    async def get_stats_by_education_type(self, session: AsyncSession, filters: StatsFilters) -> DemographicResponse:
        return await self._stats_by_student_column(session, filters, Student.education_type, "education_type")

    async def get_stats_by_education_lang(self, session: AsyncSession, filters: StatsFilters) -> DemographicResponse:
        return await self._stats_by_student_column(session, filters, Student.education_lang, "education_lang")

    async def get_stats_by_payment_form(self, session: AsyncSession, filters: StatsFilters) -> DemographicResponse:
        return await self._stats_by_student_column(session, filters, Student.payment_form, "payment_form")

    async def get_gpa_correlation(self, session: AsyncSession, filters: StatsFilters) -> GpaCorrelationResponse:
        bucket = case(
            (Student.avg_gpa < 2.5, "<2.5"),
            (Student.avg_gpa < 3.0, "2.5-3.0"),
            (Student.avg_gpa < 3.5, "3.0-3.5"),
            (Student.avg_gpa < 4.0, "3.5-4.0"),
            (Student.avg_gpa < 4.5, "4.0-4.5"),
            else_="4.5-5.0",
        ).label("gpa_bucket")

        stmt = (
            select(bucket, func.count(distinct(Student.id)), func.avg(Result.grade))
            .select_from(Result)
            .join(Student, Student.user_id == Result.user_id)
            .group_by("gpa_bucket")
        )
        stmt = apply_result_filters(stmt, filters)
        rows = (await session.execute(stmt)).all()

        ordered = {"<2.5": 0, "2.5-3.0": 1, "3.0-3.5": 2, "3.5-4.0": 3, "4.0-4.5": 4, "4.5-5.0": 5}
        results = [
            GpaBucketRow(gpa_bucket=b, student_count=int(c or 0), average_grade=float(a or 0.0)) for b, c, a in rows
        ]
        results.sort(key=lambda r: ordered.get(r.gpa_bucket, 99))
        return GpaCorrelationResponse(rows=results)

    async def get_semester_progression(
        self, session: AsyncSession, filters: StatsFilters
    ) -> SemesterProgressionResponse:
        stmt = (
            select(Student.semester, func.count(Result.id), func.avg(Result.grade))
            .select_from(Result)
            .join(Student, Student.user_id == Result.user_id)
            .group_by(Student.semester)
        )
        stmt = apply_result_filters(stmt, filters)
        rows = (await session.execute(stmt)).all()
        out = [
            SemesterRow(semester=str(s) if s is not None else "—", attempts=int(c or 0), average_grade=float(a or 0.0))
            for s, c, a in rows
        ]
        out.sort(key=lambda r: r.semester)
        return SemesterProgressionResponse(rows=out)

    # ============================================================
    # F. Yakuniy (final grades)
    # ============================================================

    async def get_final_grade_distribution(
        self, session: AsyncSession, filters: StatsFilters
    ) -> YakuniyDistributionResponse:
        bucket = _grade_bucket_case(Yakuniy.grade).label("bucket")
        stmt = select(bucket, func.count(Yakuniy.id)).select_from(Yakuniy)
        stmt = apply_date_filters(stmt, filters, Yakuniy.created_at)
        if filters.subject_id is not None:
            stmt = stmt.where(Yakuniy.subject_id == filters.subject_id)
        stmt = stmt.group_by("bucket")
        rows = (await session.execute(stmt)).all()
        counts = {r[0]: r[1] for r in rows}
        buckets = _empty_buckets()
        for b in buckets:
            b.count = counts.get(b.bucket, 0)
        return YakuniyDistributionResponse(total=sum(b.count for b in buckets), buckets=buckets)

    async def get_yakuniy_by_subject(self, session: AsyncSession, filters: StatsFilters) -> YakuniyBySubjectResponse:
        stmt = (
            select(Subject.id, Subject.name, func.count(Yakuniy.id), func.avg(Yakuniy.grade))
            .select_from(Yakuniy)
            .join(Subject, Subject.id == Yakuniy.subject_id)
            .group_by(Subject.id, Subject.name)
            .order_by(func.avg(Yakuniy.grade).desc())
        )
        stmt = apply_date_filters(stmt, filters, Yakuniy.created_at)
        rows = (await session.execute(stmt)).all()
        return YakuniyBySubjectResponse(
            rows=[
                YakuniySubjectRow(subject_id=s_id, name=name, count=int(c or 0), average_grade=float(a or 0.0))
                for s_id, name, c, a in rows
            ]
        )

    async def get_yakuniy_vs_quiz_correlation(
        self, session: AsyncSession, filters: StatsFilters
    ) -> YakuniyVsQuizResponse:
        # Average quiz grade per (user, subject)
        quiz_stmt = (
            select(Result.user_id, Result.subject_id, func.avg(Result.grade).label("quiz_avg"))
            .select_from(Result)
            .group_by(Result.user_id, Result.subject_id)
        )
        quiz_stmt = apply_result_filters(quiz_stmt, filters)
        quiz_rows = (await session.execute(quiz_stmt)).all()
        quiz_map = {(uid, sid): float(avg or 0.0) for uid, sid, avg in quiz_rows}

        # Yakuniy grades
        yak_stmt = select(Yakuniy.user_id, Yakuniy.subject_id, Yakuniy.grade).select_from(Yakuniy)
        yak_stmt = apply_date_filters(yak_stmt, filters, Yakuniy.created_at)
        if filters.subject_id is not None:
            yak_stmt = yak_stmt.where(Yakuniy.subject_id == filters.subject_id)
        yak_rows = (await session.execute(yak_stmt)).all()

        points: list[YakuniyVsQuizPoint] = []
        xs: list[float] = []
        ys: list[float] = []
        for uid, sid, grade in yak_rows:
            key = (uid, sid)
            if key in quiz_map:
                qa = quiz_map[key]
                points.append(
                    YakuniyVsQuizPoint(user_id=uid, subject_id=sid, quiz_avg=qa, yakuniy_grade=int(grade or 0))
                )
                xs.append(qa)
                ys.append(float(grade or 0))

        return YakuniyVsQuizResponse(sample_size=len(points), pearson_r=_pearson(xs, ys), points=points)

    # ============================================================
    # G. Psychology
    # ============================================================

    async def get_psychology_coverage(self, session: AsyncSession, filters: StatsFilters) -> PsychologyCoverageResponse:
        # Total student count for the filter scope (students belong to a group; filter by faculty if provided)
        student_stmt = select(func.count(Student.id))
        if filters.faculty_id is not None:
            student_stmt = student_stmt.join(Group, Group.id == Student.group_id).where(
                Group.faculty_id == filters.faculty_id
            )
        if filters.group_id is not None:
            student_stmt = student_stmt.where(Student.group_id == filters.group_id)
        total_students = int((await session.execute(student_stmt)).scalar() or 0)

        completion_stmt = (
            select(PsychologyMethod.id, PsychologyMethod.name, func.count(distinct(PsychologyResult.user_id)))
            .select_from(PsychologyMethod)
            .outerjoin(PsychologyResult, PsychologyResult.method_id == PsychologyMethod.id)
            .group_by(PsychologyMethod.id, PsychologyMethod.name)
        )
        completion_stmt = apply_date_filters(completion_stmt, filters, PsychologyResult.created_at)
        rows = (await session.execute(completion_stmt)).all()

        return PsychologyCoverageResponse(
            total_students=total_students,
            rows=[
                PsychologyMethodCoverageRow(
                    method_id=m_id,
                    name=name,
                    completions=int(c or 0),
                    coverage_pct=100.0 * _safe_div(int(c or 0), total_students),
                )
                for m_id, name, c in rows
            ],
        )

    async def get_diagnosis_distribution(
        self, session: AsyncSession, method_id: int, filters: StatsFilters
    ) -> DiagnosisDistributionResponse:
        # Pull diagnoses to Python to handle the JSONB shape robustly.
        stmt = (
            select(PsychologyResult.diagnosis)
            .select_from(PsychologyResult)
            .where(PsychologyResult.method_id == method_id)
        )
        stmt = apply_date_filters(stmt, filters, PsychologyResult.created_at)
        rows = (await session.execute(stmt)).all()

        buckets: dict[str, int] = defaultdict(int)
        for (diag,) in rows:
            buckets[_diagnosis_label(diag)] += 1
        total = sum(buckets.values())
        out = [
            DiagnosisRow(label=label, count=count, pct=100.0 * _safe_div(count, total))
            for label, count in sorted(buckets.items(), key=lambda kv: kv[1], reverse=True)
        ]
        return DiagnosisDistributionResponse(method_id=method_id, total=total, rows=out)

    async def get_psychology_method_popularity(
        self, session: AsyncSession, filters: StatsFilters
    ) -> PsychologyMethodPopularityResponse:
        stmt = (
            select(PsychologyMethod.id, PsychologyMethod.name, func.count(PsychologyResult.id))
            .select_from(PsychologyMethod)
            .outerjoin(PsychologyResult, PsychologyResult.method_id == PsychologyMethod.id)
            .group_by(PsychologyMethod.id, PsychologyMethod.name)
            .order_by(func.count(PsychologyResult.id).desc())
        )
        stmt = apply_date_filters(stmt, filters, PsychologyResult.created_at)
        rows = (await session.execute(stmt)).all()
        return PsychologyMethodPopularityResponse(
            rows=[
                PsychologyMethodPopularityRow(method_id=m_id, name=name, attempts=int(c or 0)) for m_id, name, c in rows
            ]
        )

    async def get_psychology_vs_academic(
        self, session: AsyncSession, method_id: int, filters: StatsFilters
    ) -> PsychologyVsAcademicResponse:
        # 1. For this method, group users by diagnosis label.
        psy_stmt = select(PsychologyResult.user_id, PsychologyResult.diagnosis).where(
            PsychologyResult.method_id == method_id
        )
        psy_stmt = apply_date_filters(psy_stmt, filters, PsychologyResult.created_at)
        psy_rows = (await session.execute(psy_stmt)).all()

        user_label: dict[int, str] = {}
        for uid, diag in psy_rows:
            if uid is None:
                continue
            user_label[uid] = _diagnosis_label(diag)

        if not user_label:
            return PsychologyVsAcademicResponse(method_id=method_id, rows=[])

        # 2. Average quiz grade per user (filtered).
        quiz_stmt = (
            select(Result.user_id, func.avg(Result.grade))
            .select_from(Result)
            .where(Result.user_id.in_(list(user_label.keys())))
            .group_by(Result.user_id)
        )
        quiz_stmt = apply_result_filters(quiz_stmt, filters)
        quiz_rows = (await session.execute(quiz_stmt)).all()
        user_quiz_avg = {uid: float(avg or 0.0) for uid, avg in quiz_rows}

        # 3. Roll up by label.
        bucket_grades: dict[str, list[float]] = defaultdict(list)
        for uid, label in user_label.items():
            if uid in user_quiz_avg:
                bucket_grades[label].append(user_quiz_avg[uid])

        out = [
            PsychologyVsAcademicRow(
                label=label,
                student_count=len(grades),
                average_quiz_grade=sum(grades) / len(grades) if grades else 0.0,
            )
            for label, grades in bucket_grades.items()
        ]
        out.sort(key=lambda r: r.student_count, reverse=True)
        return PsychologyVsAcademicResponse(method_id=method_id, rows=out)

    async def get_psychology_risk_group(
        self, session: AsyncSession, method_id: int, label_substring: str | None = None
    ) -> PsychologyRiskGroupResponse:
        """
        Returns students whose diagnosis label matches an optional substring
        (case-insensitive). When no substring is given, defaults to labels
        containing 'risk' / 'риск' / 'high' / 'низк' / 'low' so common risk
        markers across languages still surface.
        """
        markers = [label_substring.lower()] if label_substring else ["risk", "риск", "high", "низк", "low"]
        stmt = (
            select(PsychologyResult.user_id, User.username, PsychologyResult.diagnosis)
            .select_from(PsychologyResult)
            .outerjoin(User, User.id == PsychologyResult.user_id)
            .where(PsychologyResult.method_id == method_id)
        )
        rows = (await session.execute(stmt)).all()

        out: list[PsychologyRiskRow] = []
        for uid, name, diag in rows:
            label = _diagnosis_label(diag)
            if any(m in label.lower() for m in markers):
                out.append(
                    PsychologyRiskRow(
                        user_id=uid,
                        full_name=name,
                        label=label,
                        diagnosis=diag if isinstance(diag, (dict, list)) else None,
                    )
                )
        return PsychologyRiskGroupResponse(method_id=method_id, rows=out)

    # ============================================================
    # H. Teacher activity
    # ============================================================

    async def get_teacher_question_quality(
        self, session: AsyncSession, teacher_id: int
    ) -> TeacherQuestionQualityResponse:
        teacher = (
            await session.execute(
                select(Teacher).options(selectinload(Teacher.employee)).where(Teacher.id == teacher_id)
            )
        ).scalar_one_or_none()
        if not teacher:
            raise HTTPException(status_code=404, detail="Teacher not found")
        employee_user_id = teacher.employee.user_id

        question_count = (
            await session.execute(select(func.count(Question.id)).where(Question.user_id == employee_user_id))
        ).scalar() or 0

        # Average correct % across all answers to questions authored by this teacher.
        correct_expr = func.sum(case((UserAnswers.is_correct.is_(True), 1), else_=0))
        agg_stmt = (
            select(func.count(UserAnswers.id), correct_expr)
            .select_from(UserAnswers)
            .join(Question, Question.id == UserAnswers.question_id)
            .where(Question.user_id == employee_user_id)
        )
        total, correct = (await session.execute(agg_stmt)).one()
        total = int(total or 0)
        correct = int(correct or 0)

        return TeacherQuestionQualityResponse(
            teacher_id=teacher_id,
            total_questions=int(question_count or 0),
            average_correct_pct=100.0 * _safe_div(correct, total),
        )

    async def get_teacher_activity_timeline(
        self, session: AsyncSession, teacher_id: int, granularity: str = "month"
    ) -> TeacherActivityResponse:
        teacher = (
            await session.execute(
                select(Teacher).options(selectinload(Teacher.employee)).where(Teacher.id == teacher_id)
            )
        ).scalar_one_or_none()
        if not teacher:
            raise HTTPException(status_code=404, detail="Teacher not found")

        period = _date_trunc(granularity, Quiz.created_at).label("period")
        stmt = (
            select(period, func.count(Quiz.id))
            .where(Quiz.user_id == teacher.employee.user_id)
            .group_by("period")
            .order_by("period")
        )
        rows = (await session.execute(stmt)).all()
        return TeacherActivityResponse(
            teacher_id=teacher_id,
            granularity=granularity,
            points=[
                TeacherActivityPoint(
                    period=p.isoformat() if hasattr(p, "isoformat") else str(p),
                    quizzes_created=int(c or 0),
                )
                for p, c in rows
            ],
        )

    async def get_teacher_proctoring_summary(self, session: AsyncSession, teacher_id: int) -> TeacherProctoringResponse:
        teacher = (
            await session.execute(
                select(Teacher).options(selectinload(Teacher.employee)).where(Teacher.id == teacher_id)
            )
        ).scalar_one_or_none()
        if not teacher:
            raise HTTPException(status_code=404, detail="Teacher not found")

        cheat_expr = func.sum(case((Result.cheating_detected.is_(True), 1), else_=0))
        stmt = (
            select(func.count(Result.id), cheat_expr)
            .select_from(Result)
            .join(Quiz, Quiz.id == Result.quiz_id)
            .where(Quiz.user_id == teacher.employee.user_id)
        )
        row = (await session.execute(stmt)).one()
        total = int(row[0] or 0)
        cheating = int(row[1] or 0)
        return TeacherProctoringResponse(
            teacher_id=teacher_id,
            total_attempts=total,
            cheating_attempts=cheating,
            cheating_rate_pct=100.0 * _safe_div(cheating, total),
        )


get_statistics_repository = StatisticsRepository()
