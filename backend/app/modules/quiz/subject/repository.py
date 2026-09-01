import logging

from core.utils.external_guard import ensure_editable
from core.utils.lesson_guard import ensure_no_lessons
from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utils.visibility import apply_visibility
from app.modules.auth.model import Teacher, TeacherSubject, User
from app.modules.quiz.model import Subject

from .schemas import (
    SubjectCreateRequest,
    SubjectListRequest,
    SubjectListResponse,
)

logger = logging.getLogger(__name__)


class SubjectRepository:
    async def create_subject(self, session: AsyncSession, data: SubjectCreateRequest) -> Subject:
        stmt_check = select(Subject).where(Subject.name == data.name)
        result_check = await session.execute(stmt_check)
        if result_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Subject '{data.name}' already exists",
            )

        new_subject = Subject(name=data.name)
        session.add(new_subject)

        try:
            await session.commit()
            await session.refresh(new_subject)
        except Exception:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error",
            )
        return new_subject

    async def get_subject(self, session: AsyncSession, subject_id: int) -> Subject:
        # Use primary key id descending if created_at is not available,
        # but all models here inherit from TimestampMixin based on previous checks.
        stmt = select(Subject).where(Subject.id == subject_id)
        result = await session.execute(stmt)
        subject = result.scalar_one_or_none()

        if not subject:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

        return subject

    async def list_subjects(
        self, session: AsyncSession, request: SubjectListRequest, current_user: User
    ) -> SubjectListResponse:
        stmt = select(Subject)
        stmt = apply_visibility(stmt, Subject, current_user, request.include_hidden)

        is_admin = any(role.name.lower() == "admin" for role in current_user.roles)
        is_teacher = any(role.name.lower() == "teacher" for role in current_user.roles)
        teacher_filter = None

        if is_admin:
            pass
        elif is_teacher:
            st_stmt = (
                select(TeacherSubject.subject_id)
                .join(Teacher, Teacher.id == TeacherSubject.teacher_id)
                .where(Teacher.user_id == current_user.id)
            )
            st_result = await session.execute(st_stmt)
            allowed_subject_ids = st_result.scalars().all()

            if allowed_subject_ids:
                teacher_filter = Subject.id.in_(allowed_subject_ids)
            else:
                teacher_filter = Subject.id == -1

        if teacher_filter is not None:
            stmt = stmt.where(teacher_filter)

        if request.teacher_id:
            stmt = stmt.join(TeacherSubject, Subject.id == TeacherSubject.subject_id).where(
                TeacherSubject.teacher_id == request.teacher_id
            )

        if request.name:
            stmt = stmt.where(Subject.name.ilike(f"%{request.name}%"))

        stmt = stmt.order_by(desc(Subject.created_at))
        stmt = stmt.offset(request.offset).limit(request.limit)

        result = await session.execute(stmt)
        subjects = result.scalars().all()

        count_stmt = select(func.count()).select_from(Subject)
        count_stmt = apply_visibility(count_stmt, Subject, current_user, request.include_hidden)

        if is_admin:
            pass
        elif teacher_filter is not None:
            count_stmt = count_stmt.where(teacher_filter)

        if request.teacher_id:
            count_stmt = count_stmt.join(TeacherSubject, Subject.id == TeacherSubject.subject_id).where(
                TeacherSubject.teacher_id == request.teacher_id
            )

        if request.name:
            count_stmt = count_stmt.where(Subject.name.ilike(f"%{request.name}%"))

        total_result = await session.execute(count_stmt)
        total = total_result.scalar() or 0

        return SubjectListResponse(total=total, page=request.page, limit=request.limit, subjects=subjects)

    async def update_subject(self, session: AsyncSession, subject_id: int, data: SubjectCreateRequest) -> Subject:
        stmt = select(Subject).where(Subject.id == subject_id)
        result = await session.execute(stmt)
        subject = result.scalar_one_or_none()

        if not subject:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

        ensure_editable(subject, "предмета")

        if data.name is not None:
            stmt_check = select(Subject).where(Subject.name == data.name, Subject.id != subject_id)
            existing_subject = (await session.execute(stmt_check)).scalar_one_or_none()
            if existing_subject:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Subject name already taken",
                )
            subject.name = data.name

        await session.commit()
        await session.refresh(subject)
        return subject

    async def delete_subject(self, session: AsyncSession, subject_id: int, force: bool = False) -> None:
        from sqlalchemy import delete, func

        from app.modules.quiz.model import Question, Quiz

        # Admin requested to aggressively delete the subject and its dependencies.
        ensure_editable(await self.get_subject(session, subject_id), "предмета")

        if not force:
            teachers_count = (
                await session.execute(
                    select(func.count(TeacherSubject.id)).where(TeacherSubject.subject_id == subject_id)
                )
            ).scalar() or 0
            questions_count = (
                await session.execute(
                    select(func.count(Question.id)).where(
                        Question.subject_id == subject_id, Question.is_active.is_(True)
                    )
                )
            ).scalar() or 0
            quizzes_count = (
                await session.execute(select(func.count(Quiz.id)).where(Quiz.subject_id == subject_id))
            ).scalar() or 0

            total = teachers_count + questions_count + quizzes_count
            if total > 0:
                warnings = []
                if teachers_count > 0:
                    warnings.append(f"{teachers_count} ta o'qituvchi(lar) fandan uziladi")
                if questions_count > 0:
                    warnings.append(f"{questions_count} ta test savollari tozalanadi")
                if quizzes_count > 0:
                    warnings.append(f"{quizzes_count} ta tayyor testlar o'chadi")

                raise HTTPException(
                    status_code=409,
                    detail={
                        "requires_confirmation": True,
                        "message": (
                            "Siz ushbu fanni o'chirishga harakat qilyapsiz. "
                            "Bu yordamchi qismlarni ham o'chirib yuboradi:"
                        ),
                        "warnings": warnings,
                    },
                )

        # 1. Sever TeacherSubject links. `force` bu to'siqni ochmaydi: bu fan
        # bo'yicha dars o'tilgan bo'lsa, biriktiruv `lessons` RESTRICT tufayli
        # uzilmaydi.
        await ensure_no_lessons(session, "Bu fan", TeacherSubject.subject_id == subject_id)
        await session.execute(delete(TeacherSubject).where(TeacherSubject.subject_id == subject_id))

        # 2. Soft-delete Questions belonging to this subject — questions are never
        # physically removed (see Question.is_active), so quiz_questions/user_answers
        # referencing them keep resolving.
        await session.execute(
            Question.__table__.update().where(Question.subject_id == subject_id).values(is_active=False)
        )

        # 3. Delete Quizzes (QuizQuestion references from quiz side are CASCADE, so safe)
        await session.execute(delete(Quiz).where(Quiz.subject_id == subject_id))

        stmt = select(Subject).where(Subject.id == subject_id)
        result = await session.execute(stmt)
        subject = result.scalar_one_or_none()

        if not subject:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

        await session.delete(subject)
        await session.commit()


get_subject_repository = SubjectRepository()
