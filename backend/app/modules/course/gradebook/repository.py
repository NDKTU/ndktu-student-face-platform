"""Dars baholash jurnali: talabalar × (uy vazifasi, testlar).

Alohida jadval yo'q — hammasi mavjud yozuvlardan yig'iladi: talabalar dars
guruhlaridan, uy vazifasi bahosi `homework_submissions` dan, test bahosi
`results` dan. Shuning uchun jurnal hech qachon eskirmaydi.
"""

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utils.lesson_access import ensure_can_manage_lesson
from app.core.utils.lesson_scope import visible_to_group
from app.modules.auth.model import Student, User
from app.modules.course.model import CourseGroup, Homework, HomeworkSubmission, Lesson
from app.modules.organization_structure.model import Group
from app.modules.quiz.model import Quiz, Result

from .schemas import (
    GradebookHomework,
    GradebookHomeworkCell,
    GradebookQuiz,
    GradebookQuizCell,
    GradebookResponse,
    GradebookRow,
    MyGradesResponse,
    MyGradesTopic,
    MyHomeworkGrade,
    MyQuizGrade,
)


def _naive(value):
    return value.replace(tzinfo=None) if value is not None and value.tzinfo else value


class GradebookRepository:
    async def _lesson_group_ids(self, session: AsyncSession, lesson: Lesson) -> list[int]:
        # Davomat jurnalidagi qoida bilan bir xil: guruhi yo'q dars — kursning
        # barcha guruhlariniki.
        if lesson.group_id is not None:
            return [lesson.group_id]
        rows = await session.execute(
            select(CourseGroup.group_id).where(CourseGroup.course_id == lesson.course_id)
        )
        return [row[0] for row in rows]

    async def lesson_gradebook(
        self, session: AsyncSession, lesson_id: int, current_user: User
    ) -> GradebookResponse:
        lesson = await session.get(Lesson, lesson_id)
        if lesson is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dars topilmadi")
        await ensure_can_manage_lesson(
            session, lesson, current_user, detail="Baholash jurnali faqat dars o'qituvchisiga ochiq"
        )

        group_ids = await self._lesson_group_ids(session, lesson)
        roster = (
            (
                await session.execute(
                    select(Student.id, Student.user_id, Student.full_name, Group.name)
                    .outerjoin(Group, Group.id == Student.group_id)
                    .where(Student.group_id.in_(group_ids or [0]))
                    .order_by(Group.name, Student.full_name)
                )
            ).all()
        )
        user_ids = [user_id for _, user_id, _, _ in roster if user_id is not None]

        homework = await session.scalar(select(Homework).where(Homework.lesson_id == lesson.id))
        homework_cells: dict[int, GradebookHomeworkCell] = {}
        if homework is not None and user_ids:
            deadline = _naive(homework.deadline)
            subs = (
                await session.scalars(
                    select(HomeworkSubmission).where(
                        HomeworkSubmission.homework_id == homework.id,
                        HomeworkSubmission.user_id.in_(user_ids),
                    )
                )
            ).all()
            for sub in subs:
                submitted_at = _naive(sub.submitted_at)
                homework_cells[sub.user_id] = GradebookHomeworkCell(
                    status=sub.status,
                    grade=sub.grade,
                    submitted_at=sub.submitted_at,
                    late=bool(submitted_at and deadline and submitted_at > deadline),
                )

        quizzes = (
            await session.scalars(
                select(Quiz).where(Quiz.lesson_id == lesson.id).order_by(Quiz.created_at, Quiz.id)
            )
        ).all()
        quiz_cells: dict[int, dict[int, GradebookQuizCell]] = {}
        if quizzes and user_ids:
            results = (
                await session.scalars(
                    select(Result)
                    .where(
                        Result.quiz_id.in_([q.id for q in quizzes]),
                        Result.user_id.in_(user_ids),
                        Result.status == "completed",
                    )
                    # Oxirgi urinish oxirida keladi va avvalgisining o'rnini egallaydi.
                    .order_by(Result.created_at, Result.id)
                )
            ).all()
            for result in results:
                per_user = quiz_cells.setdefault(result.user_id, {})
                previous = per_user.get(result.quiz_id)
                per_user[result.quiz_id] = GradebookQuizCell(
                    quiz_id=result.quiz_id,
                    grade=result.grade,
                    correct_answers=result.correct_answers,
                    wrong_answers=result.wrong_answers,
                    cheating_detected=bool(result.cheating_detected),
                    attempts=(previous.attempts + 1) if previous else 1,
                )

        return GradebookResponse(
            lesson_id=lesson.id,
            homework=(
                GradebookHomework(
                    id=homework.id,
                    title=homework.title,
                    max_grade=homework.max_grade,
                    deadline=homework.deadline,
                )
                if homework is not None
                else None
            ),
            quizzes=[GradebookQuiz(id=q.id, title=q.title, quiz_type=q.quiz_type) for q in quizzes],
            students=[
                GradebookRow(
                    student_id=student_id,
                    user_id=user_id,
                    full_name=full_name,
                    group_name=group_name,
                    homework=homework_cells.get(user_id) if user_id is not None else None,
                    quizzes=list(quiz_cells.get(user_id, {}).values()) if user_id is not None else [],
                )
                for student_id, user_id, full_name, group_name in roster
            ],
        )

    async def my_course_grades(
        self, session: AsyncSession, course_id: int, current_user: User
    ) -> MyGradesResponse:
        """Talabaning kursdagi baholari — har bir mavzu (dars) bo'yicha.

        Faqat o'zi ko'radigan darslar (`visible_to_group`) va o'z guruhiga
        mo'ljallangan testlar: boshqa guruhning darsi ro'yxatda «baho yo'q»
        bo'lib turib, talabani chalg'itmasin.
        """
        student = await session.scalar(select(Student).where(Student.user_id == current_user.id))
        if student is None or student.group_id is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Talaba ma'lumoti topilmadi")
        enrolled = await session.scalar(
            select(CourseGroup.id).where(
                CourseGroup.course_id == course_id, CourseGroup.group_id == student.group_id
            )
        )
        if enrolled is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Siz bu kursda o'qimaysiz")

        lessons = (
            await session.scalars(
                select(Lesson)
                .where(Lesson.course_id == course_id, visible_to_group(student.group_id))
                .order_by(Lesson.date.asc(), Lesson.id.asc())
            )
        ).all()
        lesson_ids = [lesson.id for lesson in lessons]

        # Darsga biriktirilgan va kurs darajasidagi (darssiz) vazifalar.
        homeworks = (
            await session.scalars(
                select(Homework)
                .where(
                    Homework.course_id == course_id,
                    or_(Homework.lesson_id.in_(lesson_ids or [0]), Homework.lesson_id.is_(None)),
                )
                .order_by(Homework.deadline, Homework.id)
            )
        ).all()
        subs = {
            sub.homework_id: sub
            for sub in (
                await session.scalars(
                    select(HomeworkSubmission).where(
                        HomeworkSubmission.user_id == current_user.id,
                        HomeworkSubmission.homework_id.in_([h.id for h in homeworks] or [0]),
                    )
                )
            ).all()
        }

        quizzes = (
            await session.scalars(
                select(Quiz)
                .where(
                    Quiz.lesson_id.in_(lesson_ids or [0]),
                    or_(Quiz.group_id.is_(None), Quiz.group_id == student.group_id),
                )
                .order_by(Quiz.created_at, Quiz.id)
            )
        ).all()
        # Oxirgi yakunlangan urinish — o'qituvchi jurnalidagi qoida bilan bir xil.
        latest: dict[int, tuple[Result, int]] = {}
        for result in (
            await session.scalars(
                select(Result)
                .where(
                    Result.user_id == current_user.id,
                    Result.quiz_id.in_([q.id for q in quizzes] or [0]),
                    Result.status == "completed",
                )
                .order_by(Result.created_at, Result.id)
            )
        ).all():
            previous = latest.get(result.quiz_id)
            latest[result.quiz_id] = (result, (previous[1] + 1) if previous else 1)

        def homework_grade(h: Homework) -> MyHomeworkGrade:
            sub = subs.get(h.id)
            submitted_at = _naive(sub.submitted_at) if sub else None
            return MyHomeworkGrade(
                id=h.id,
                title=h.title,
                max_grade=h.max_grade,
                deadline=h.deadline,
                status=sub.status if sub else None,
                grade=sub.grade if sub else None,
                late=bool(submitted_at and submitted_at > _naive(h.deadline)),
            )

        def quiz_grade(q: Quiz) -> MyQuizGrade:
            result, attempts = latest.get(q.id, (None, 0))
            return MyQuizGrade(
                id=q.id,
                title=q.title,
                grade=result.grade if result else None,
                correct_answers=result.correct_answers if result else None,
                wrong_answers=result.wrong_answers if result else None,
                attempts=attempts,
            )

        homework_by_lesson = {h.lesson_id: h for h in homeworks if h.lesson_id is not None}
        quizzes_by_lesson: dict[int, list[Quiz]] = {}
        for quiz in quizzes:
            quizzes_by_lesson.setdefault(quiz.lesson_id, []).append(quiz)

        topics = [
            MyGradesTopic(
                lesson_id=lesson.id,
                topic=lesson.topic,
                date=lesson.date,
                homework=homework_grade(homework_by_lesson[lesson.id]) if lesson.id in homework_by_lesson else None,
                quizzes=[quiz_grade(q) for q in quizzes_by_lesson.get(lesson.id, [])],
            )
            for lesson in lessons
        ]
        topics += [
            MyGradesTopic(topic=h.title, homework=homework_grade(h))
            for h in homeworks
            if h.lesson_id is None
        ]
        return MyGradesResponse(course_id=course_id, topics=topics)


get_gradebook_repository = GradebookRepository()
