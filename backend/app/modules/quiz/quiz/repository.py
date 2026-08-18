import logging

from core.config import settings
from fastapi import HTTPException, status
from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.utils.image_upload import save_image
from app.modules.auth.model import Employee, Student, Teacher, User
from app.modules.organization_structure.model import GroupTeacher
from app.modules.quiz.model import Question, Quiz, QuizQuestion, SubjectTeacher

from .schemas import (
    QuizCreateRequest,
    QuizListRequest,
    QuizListResponse,
)

logger = logging.getLogger(__name__)


class QuizRepository:
    def _lecturer_questions_stmt(self, lecturer_id: int, subject_id: int):
        """Банк вопросов лектора по предмету — активные, последней версии.

        Банк персональный: тест собирается из вопросов того лектора, который
        читает лекции группе, а не из всех вопросов предмета.
        """
        return select(Question).where(
            Question.user_id == lecturer_id,
            Question.subject_id == subject_id,
            Question.is_active.is_(True),
            Question.is_latest.is_(True),
        )

    async def count_available_questions(self, session: AsyncSession, lecturer_id: int, subject_id: int) -> int:
        stmt = select(func.count()).select_from(self._lecturer_questions_stmt(lecturer_id, subject_id).subquery())
        return (await session.execute(stmt)).scalar() or 0

    def _not_enough_questions(self, available: int, requested: int) -> HTTPException:
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "not_enough_questions",
                "available": available,
                "requested": requested,
                "message": (
                    f"Testni faollashtirish uchun savollar yetarli emas: "
                    f"{available} ta savol mavjud, {requested} ta talab qilingan."
                ),
            },
        )

    async def create_quiz(self, session: AsyncSession, data: QuizCreateRequest, created_by_user_id: int) -> Quiz:
        # Проверяем банк только при активации. Неактивный тест организатор вправе
        # подготовить заранее, пока лектор ещё грузит вопросы; экзаменом он
        # становится в момент включения — там же и проверяем.
        #
        # Почему проверка вообще нужна: start_quiz молча выдаёт столько вопросов,
        # сколько нашлось, поэтому тест на 30 вопросов из банка в 12 превратился бы
        # в экзамен на 12 — с оценкой, несравнимой с другими группами.
        if data.is_active and data.lecturer_id and data.subject_id:
            available = await self.count_available_questions(
                session=session,
                lecturer_id=data.lecturer_id,
                subject_id=data.subject_id,
            )
            if available < data.question_number:
                raise self._not_enough_questions(available, data.question_number)

        new_quiz = Quiz(
            title=data.title,
            question_number=data.question_number,
            duration=data.duration,
            pin=data.pin,
            is_active=data.is_active,
            proctoring_mode=data.proctoring_mode,
            lecturer_id=data.lecturer_id,
            created_by_user_id=created_by_user_id,
            group_id=data.group_id,
            subject_id=data.subject_id,
        )
        session.add(new_quiz)

        if data.lecturer_id and data.subject_id:
            result_questions = await session.execute(self._lecturer_questions_stmt(data.lecturer_id, data.subject_id))
            for question in result_questions.scalars().all():
                session.add(QuizQuestion(quiz=new_quiz, question=question))

        # Связка GroupTeacher здесь раньше создавалась автоматически. Убрано: под
        # разделением ролей это значило бы, что организатор, создав тест группе,
        # молча становится её преподавателем. Права не должны появляться как
        # побочный эффект действия.

        try:
            await session.commit()
            await session.refresh(new_quiz)
        except Exception:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error",
            )
        return new_quiz

    async def get_quiz(self, session: AsyncSession, quiz_id: int) -> Quiz:
        stmt = select(Quiz).where(Quiz.id == quiz_id)
        result = await session.execute(stmt)
        quiz = result.scalar_one_or_none()

        if not quiz:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found")

        return quiz

    async def list_quizzes(
        self, session: AsyncSession, request: QuizListRequest, current_user: User
    ) -> QuizListResponse:
        stmt = select(Quiz)

        is_teacher = any(role.name.lower() == "teacher" for role in current_user.roles)
        is_student = any(role.name.lower() == "student" for role in current_user.roles)
        teacher_filter = None
        student_group_id = None

        # Students always see quizzes for their group — even if they also have a Teacher role
        if is_student:
            student_stmt = select(Student.group_id).where(Student.user_id == current_user.id)
            student_result = await session.execute(student_stmt)
            student_group_id = student_result.scalar_one_or_none()
            if student_group_id:
                stmt = stmt.where(Quiz.group_id == student_group_id)
            else:
                stmt = stmt.where(Quiz.id == -1)  # no group → no quizzes

        elif is_teacher:
            # Check teacher's groups
            gt_stmt = select(GroupTeacher.group_id).where(GroupTeacher.teacher_id == current_user.id)
            gt_result = await session.execute(gt_stmt)
            allowed_group_ids = gt_result.scalars().all()

            # Check teacher's subjects
            st_stmt = (
                select(SubjectTeacher.subject_id)
                .join(Teacher, Teacher.id == SubjectTeacher.teacher_id)
                .join(Employee, Teacher.employee_id == Employee.id)
                .where(Employee.user_id == current_user.id)
            )
            st_result = await session.execute(st_stmt)
            allowed_subject_ids = st_result.scalars().all()

            # Тесты, собранные из банка этого преподавателя, видны ему всегда —
            # даже если предмет или группа за ним формально не закреплены. Раньше
            # видимость держалась на GroupTeacher, который создавался побочным
            # эффектом создания теста; теперь тест создаёт организатор, и такая
            # связка не появляется.
            conditions = [Quiz.lecturer_id == current_user.id]
            if allowed_group_ids:
                conditions.append(Quiz.group_id.in_(allowed_group_ids))
            if allowed_subject_ids:
                conditions.append(Quiz.subject_id.in_(allowed_subject_ids))

            teacher_filter = or_(*conditions)
            stmt = stmt.where(teacher_filter)

        if request.title:
            stmt = stmt.where(Quiz.title.ilike(f"%{request.title}%"))

        if request.user_id:
            stmt = stmt.where(Quiz.lecturer_id == request.user_id)

        if request.created_by_user_id:
            stmt = stmt.where(Quiz.created_by_user_id == request.created_by_user_id)

        if request.group_id:
            stmt = stmt.where(Quiz.group_id == request.group_id)

        if request.subject_id:
            stmt = stmt.where(Quiz.subject_id == request.subject_id)

        if request.is_active is not None:
            stmt = stmt.where(Quiz.is_active == request.is_active)

        # Always prioritize active quizzes first, then sort by date
        sort_field = (
            asc(Quiz.created_at) if request.sort_dir and request.sort_dir.lower() == "asc" else desc(Quiz.created_at)
        )
        stmt = stmt.order_by(desc(Quiz.is_active), sort_field)

        stmt = stmt.offset(request.offset).limit(request.limit)

        result = await session.execute(stmt)
        quizzes = result.scalars().all()

        count_stmt = select(func.count()).select_from(Quiz)

        if is_student:
            if student_group_id:
                count_stmt = count_stmt.where(Quiz.group_id == student_group_id)
            else:
                count_stmt = count_stmt.where(Quiz.id == -1)
        elif is_teacher and teacher_filter is not None:
            count_stmt = count_stmt.where(teacher_filter)

        if request.title:
            count_stmt = count_stmt.where(Quiz.title.ilike(f"%{request.title}%"))
        if request.user_id:
            count_stmt = count_stmt.where(Quiz.lecturer_id == request.user_id)
        if request.created_by_user_id:
            count_stmt = count_stmt.where(Quiz.created_by_user_id == request.created_by_user_id)
        if request.group_id:
            count_stmt = count_stmt.where(Quiz.group_id == request.group_id)
        if request.subject_id:
            count_stmt = count_stmt.where(Quiz.subject_id == request.subject_id)
        if request.is_active is not None:
            count_stmt = count_stmt.where(Quiz.is_active == request.is_active)

        total_result = await session.execute(count_stmt)
        total = total_result.scalar() or 0

        return QuizListResponse(total=total, page=request.page, limit=request.limit, quizzes=quizzes)

    async def update_quiz(self, session: AsyncSession, quiz_id: int, data: QuizCreateRequest) -> Quiz:
        stmt = select(Quiz).where(Quiz.id == quiz_id)
        result = await session.execute(stmt)
        quiz = result.scalar_one_or_none()

        if not quiz:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found")

        # Смена лектора после создания запрещена: вопросы подобраны в quiz_questions
        # один раз, при создании, и молча разошлись бы с новым лектором — тест
        # остался бы собран из банка прежнего. Пересборка набора вопросов затёрла бы
        # уже выданные попытки, поэтому правильный путь — создать тест заново.
        if data.lecturer_id is not None and quiz.lecturer_id is not None and data.lecturer_id != quiz.lecturer_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "code": "lecturer_change_forbidden",
                    "message": (
                        "Testni yaratgandan keyin o'qituvchini o'zgartirish mumkin emas: "
                        "savollar uning bankidan yig'ilgan. Yangi test yarating."
                    ),
                },
            )

        # Заполнить пустого лектора у старого теста можно — это не меняет уже
        # подобранный набор вопросов, а только фиксирует, кому он принадлежит.
        if quiz.lecturer_id is None and data.lecturer_id is not None:
            quiz.lecturer_id = data.lecturer_id

        # Активный тест обязан иметь достаточно вопросов. Считаем именно связанные
        # с тестом активные вопросы, а не банк лектора: набор фиксируется при
        # создании, и вопрос могли удалить уже после этого.
        if data.is_active:
            linked = (
                await session.execute(
                    select(func.count())
                    .select_from(QuizQuestion)
                    .join(Question, Question.id == QuizQuestion.question_id)
                    .where(
                        QuizQuestion.quiz_id == quiz_id,
                        Question.is_active.is_(True),
                    )
                )
            ).scalar() or 0
            if linked < data.question_number:
                raise self._not_enough_questions(linked, data.question_number)

        quiz.title = data.title
        quiz.question_number = data.question_number
        quiz.duration = data.duration
        quiz.pin = data.pin
        quiz.is_active = data.is_active
        quiz.proctoring_mode = data.proctoring_mode
        quiz.group_id = data.group_id
        quiz.subject_id = data.subject_id

        await session.commit()
        await session.refresh(quiz)
        return quiz

    async def delete_quiz(self, session: AsyncSession, quiz_id: int, force: bool = False) -> None:
        from sqlalchemy import delete as sa_delete

        from app.modules.quiz.model import Result

        stmt = select(Quiz).where(Quiz.id == quiz_id)
        result = await session.execute(stmt)
        quiz = result.scalar_one_or_none()

        if not quiz:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found")

        if not force:
            result_count = (
                await session.execute(select(func.count(Result.id)).where(Result.quiz_id == quiz_id))
            ).scalar() or 0
            if result_count > 0:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "requires_confirmation": True,
                        "message": "Ushbu testni o'chirish quyidagi bog'langan ma'lumotlarga ta'sir qiladi:",
                        "warnings": [f"{result_count} ta talaba natijalari (ballari) butunlay o'chib ketadi"],
                    },
                )

        # Cascade-delete all results linked to this quiz before deleting the quiz
        await session.execute(sa_delete(Result).where(Result.quiz_id == quiz_id))

        await session.delete(quiz)
        await session.commit()

    async def repeat_quiz(self, session: AsyncSession, quiz_id: int, created_by_user_id: int) -> Quiz:
        import random

        stmt = (
            select(Quiz)
            .options(selectinload(Quiz.quiz_questions).selectinload(QuizQuestion.question))
            .where(Quiz.id == quiz_id)
        )
        result = await session.execute(stmt)
        quiz = result.scalar_one_or_none()

        if not quiz:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found")

        new_quiz = Quiz(
            title=quiz.title,
            question_number=quiz.question_number,
            duration=quiz.duration,
            pin=str(random.randint(1000, 9999)),  # Generate a new 4-digit PIN
            is_active=quiz.is_active,
            proctoring_mode=quiz.proctoring_mode,
            # Банк вопросов остаётся лекторским, а пересдачу выдаёт организатор —
            # поэтому лектор наследуется, а создатель берётся текущий.
            lecturer_id=quiz.lecturer_id,
            created_by_user_id=created_by_user_id,
            group_id=quiz.group_id,
            subject_id=quiz.subject_id,
            attempt=2,
        )
        session.add(new_quiz)
        await session.flush()

        for qq in quiz.quiz_questions:
            if qq.question:
                new_qq = QuizQuestion(quiz_id=new_quiz.id, question_id=qq.question_id)
                session.add(new_qq)

        # Связка GroupTeacher здесь тоже не создаётся — см. комментарий в create_quiz.

        try:
            await session.commit()
            await session.refresh(new_quiz)
        except Exception:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error",
            )
        return new_quiz

    async def upload_image(self, file) -> str:
        filename = await save_image(file, settings.question_upload_dir)
        return f"{settings.file_url.http}/question/{filename}"


get_quiz_repository = QuizRepository()
