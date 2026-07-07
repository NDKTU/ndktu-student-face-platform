import logging

from core.config import settings
from fastapi import HTTPException, status
from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

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
    async def create_quiz(self, session: AsyncSession, data: QuizCreateRequest) -> Quiz:
        new_quiz = Quiz(
            title=data.title,
            question_number=data.question_number,
            duration=data.duration,
            pin=data.pin,
            is_active=data.is_active,
            proctoring_mode=data.proctoring_mode,
            user_id=data.user_id,
            group_id=data.group_id,
            subject_id=data.subject_id,
        )
        session.add(new_quiz)

        # Auto-link questions if user_id and subject_id are provided
        if data.user_id and data.subject_id:
            # Find all active, latest-version questions with matching user_id and subject_id
            stmt_questions = select(Question).where(
                Question.user_id == data.user_id,
                Question.subject_id == data.subject_id,
                Question.is_active.is_(True),
                Question.is_latest.is_(True),
            )
            result_questions = await session.execute(stmt_questions)
            questions = result_questions.scalars().all()

            for question in questions:
                # Create relation
                quiz_question = QuizQuestion(quiz=new_quiz, question=question)
                session.add(quiz_question)

        # Auto-create GroupTeacher relation if user_id and group_id are provided
        if data.user_id and data.group_id:
            # Check if relation already exists
            stmt_check = select(GroupTeacher).where(
                GroupTeacher.teacher_id == data.user_id,
                GroupTeacher.group_id == data.group_id,
            )
            result_check = await session.execute(stmt_check)
            existing_relation = result_check.scalar_one_or_none()

            if not existing_relation:
                new_group_teacher = GroupTeacher(teacher_id=data.user_id, group_id=data.group_id)
                session.add(new_group_teacher)

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

            conditions = []
            if allowed_group_ids:
                conditions.append(Quiz.group_id.in_(allowed_group_ids))
            if allowed_subject_ids:
                conditions.append(Quiz.subject_id.in_(allowed_subject_ids))

            if conditions:
                teacher_filter = or_(*conditions)
            else:
                teacher_filter = Quiz.id == -1

            stmt = stmt.where(teacher_filter)

        if request.title:
            stmt = stmt.where(Quiz.title.ilike(f"%{request.title}%"))

        if request.user_id:
            stmt = stmt.where(Quiz.user_id == request.user_id)

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
            count_stmt = count_stmt.where(Quiz.user_id == request.user_id)
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

        quiz.title = data.title
        quiz.question_number = data.question_number
        quiz.duration = data.duration
        quiz.pin = data.pin
        quiz.is_active = data.is_active
        quiz.proctoring_mode = data.proctoring_mode
        quiz.user_id = data.user_id
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

    async def repeat_quiz(self, session: AsyncSession, quiz_id: int) -> Quiz:
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
            user_id=quiz.user_id,
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

        # Handle GroupTeacher relation if needed, though usually it's already there from original quiz creation
        if new_quiz.user_id and new_quiz.group_id:
            stmt_check = select(GroupTeacher).where(
                GroupTeacher.teacher_id == new_quiz.user_id,
                GroupTeacher.group_id == new_quiz.group_id,
            )
            result_check = await session.execute(stmt_check)
            if not result_check.scalar_one_or_none():
                new_group_teacher = GroupTeacher(teacher_id=new_quiz.user_id, group_id=new_quiz.group_id)
                session.add(new_group_teacher)

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
        import os
        import shutil
        import uuid

        # Generate unique filename
        file_ext = file.filename.split(".")[-1]
        filename = f"{uuid.uuid4()}.{file_ext}"

        upload_dir = settings.question_upload_dir
        os.makedirs(upload_dir, exist_ok=True)
        file_path = upload_dir / filename

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return f"{settings.file_url.http}/question/{filename}"


get_quiz_repository = QuizRepository()
