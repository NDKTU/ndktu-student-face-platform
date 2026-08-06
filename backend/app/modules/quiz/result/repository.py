import logging

from fastapi import HTTPException, status
from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.utils.roles import is_admin as user_is_admin
from app.modules.auth.employee.model import Employee
from app.modules.auth.student.model import Student
from app.modules.auth.teacher.model import Teacher
from app.modules.auth.user.model import User
from app.modules.organization_structure.group.model import GroupTeacher
from app.modules.quiz.result.model import Result
from app.modules.quiz.subject.model import SubjectTeacher

from .schemas import (
    ResultListRequest,
    ResultListResponse,
)

logger = logging.getLogger(__name__)


class ResultRepository:
    async def scope_filter(self, session: AsyncSession, current_user: User):
        """Условие «какие Result видит этот пользователь», или None — «все».

        Вынесено из list_results, потому что выборка по id должна отвечать на тот
        же вопрос теми же словами: раньше список аккуратно резал видимость по
        роли, а `/result/{id}` не проверял ничего, и перебором id читались чужие
        оценки вместе с доказательствами прокторинга.

        ВНИМАНИЕ: у пользователя, который не admin/teacher/student (например
        роль `dekan` с правом read:result), не срабатывает ни одна ветка и он
        видит всё. Это F05 — авторизация по имени роли; здесь поведение
        сохранено как есть, чтобы список и деталь не разъехались.
        """
        is_admin = user_is_admin(current_user)
        is_teacher = any(role.name.lower() == "teacher" for role in current_user.roles)
        is_student = any(role.name.lower() == "student" for role in current_user.roles)

        if is_admin:
            return None

        if is_teacher:
            allowed_group_ids = (
                await session.execute(
                    select(GroupTeacher.group_id).where(GroupTeacher.teacher_id == current_user.id)
                )
            ).scalars().all()

            allowed_subject_ids = (
                await session.execute(
                    select(SubjectTeacher.subject_id)
                    .join(Teacher, Teacher.id == SubjectTeacher.teacher_id)
                    .join(Employee, Teacher.employee_id == Employee.id)
                    .where(Employee.user_id == current_user.id)
                )
            ).scalars().all()

            if allowed_group_ids and allowed_subject_ids:
                return Result.group_id.in_(allowed_group_ids) & Result.subject_id.in_(allowed_subject_ids)
            if allowed_group_ids:
                return Result.group_id.in_(allowed_group_ids)
            if allowed_subject_ids:
                return Result.subject_id.in_(allowed_subject_ids)
            # Ничего не закреплено — не видит ничего.
            return Result.id == -1

        if is_student:
            return Result.user_id == current_user.id

        return None

    async def get_result(self, session: AsyncSession, result_id: int, current_user: User) -> Result:
        stmt = (
            select(Result)
            .options(
                selectinload(Result.user).selectinload(User.student),
                selectinload(Result.quiz),
                selectinload(Result.subject),
                selectinload(Result.group),
            )
            .where(Result.id == result_id)
        )

        scope = await self.scope_filter(session, current_user)
        if scope is not None:
            stmt = stmt.where(scope)

        result = await session.execute(stmt)
        obj = result.scalar_one_or_none()

        if not obj:
            # 404, а не 403, и для чужой записи тоже: иначе ответ сам сообщал бы,
            # какие id существуют.
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Result not found")

        return obj

    async def list_results(
        self, session: AsyncSession, request: ResultListRequest, current_user: User
    ) -> ResultListResponse:
        # Subquery to identify the latest result record for each user/quiz pair
        subq = (
            select(Result.user_id, Result.quiz_id, func.max(Result.id).label("max_id"))
            .group_by(Result.user_id, Result.quiz_id)
            .subquery()
        )

        stmt = (
            select(Result)
            .join(subq, Result.id == subq.c.max_id)
            .options(
                selectinload(Result.user).selectinload(User.student),
                selectinload(Result.quiz),
                selectinload(Result.subject),
                selectinload(Result.group),
            )
        )

        # If username search is needed, add explicit joins for filtering
        if request.username:
            stmt = stmt.outerjoin(User, Result.user_id == User.id).outerjoin(Student, User.id == Student.user_id)

        # Та же видимость, что и у выборки по id: одно условие, одно место.
        scope = await self.scope_filter(session, current_user)
        if scope is not None:
            stmt = stmt.where(scope)

        if request.user_id:
            stmt = stmt.where(Result.user_id == request.user_id)

        if request.quiz_id:
            stmt = stmt.where(Result.quiz_id == request.quiz_id)

        if request.group_id:
            stmt = stmt.where(Result.group_id == request.group_id)

        if request.subject_id:
            stmt = stmt.where(Result.subject_id == request.subject_id)

        if request.grade is not None:
            stmt = stmt.where(Result.grade == request.grade)

        if request.username:
            # Search by username or student full_name (case-insensitive)
            search_pattern = f"%{request.username}%"
            stmt = stmt.where(
                or_(
                    User.username.ilike(search_pattern),
                    Student.full_name.ilike(search_pattern),
                )
            ).distinct()

        if request.sort_dir and request.sort_dir.lower() == "asc":
            stmt = stmt.order_by(asc(Result.created_at))
        else:
            stmt = stmt.order_by(desc(Result.created_at))

        stmt = stmt.offset(request.offset).limit(request.limit)

        result = await session.execute(stmt)
        results = result.scalars().all()

        # Count stmt must also use the same join logic to be accurate
        count_stmt = select(func.count(Result.id)).select_from(Result).join(subq, Result.id == subq.c.max_id)

        # If username search is needed, add explicit joins for filtering
        if request.username:
            count_stmt = count_stmt.outerjoin(User, Result.user_id == User.id).outerjoin(
                Student, User.id == Student.user_id
            )

        # Тот же scope, что и у выборки: иначе total сообщал бы, сколько записей
        # существует на самом деле, даже когда видно из них ноль.
        if scope is not None:
            count_stmt = count_stmt.where(scope)

        if request.user_id:
            count_stmt = count_stmt.where(Result.user_id == request.user_id)
        if request.quiz_id:
            count_stmt = count_stmt.where(Result.quiz_id == request.quiz_id)
        if request.group_id:
            count_stmt = count_stmt.where(Result.group_id == request.group_id)
        if request.subject_id:
            count_stmt = count_stmt.where(Result.subject_id == request.subject_id)
        if request.grade is not None:
            count_stmt = count_stmt.where(Result.grade == request.grade)
        if request.username:
            # Search by username or student full_name (case-insensitive)
            search_pattern = f"%{request.username}%"
            count_stmt = count_stmt.where(
                or_(
                    User.username.ilike(search_pattern),
                    Student.full_name.ilike(search_pattern),
                )
            )

        total_result = await session.execute(count_stmt)
        total = total_result.scalar() or 0

        return ResultListResponse(total=total, page=request.page, limit=request.limit, results=results)

    async def delete_result(self, session: AsyncSession, result_id: int) -> None:
        from sqlalchemy import delete

        from app.modules.quiz.user_answers.model import UserAnswers

        stmt = select(Result).where(Result.id == result_id)
        result = await session.execute(stmt)
        obj = result.scalar_one_or_none()

        if not obj:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Result not found")

        # Delete associated user answers by user_id + quiz_id.
        # Bug#3 fix: do NOT match by created_at — timestamps between Result and UserAnswers
        # may differ by milliseconds, causing answers to be left as orphans.
        delete_answers_stmt = delete(UserAnswers).where(
            UserAnswers.user_id == obj.user_id,
            UserAnswers.quiz_id == obj.quiz_id,
        )
        await session.execute(delete_answers_stmt)

        await session.delete(obj)
        await session.commit()

    async def get_recent_by_user(self, session: AsyncSession, user_id: int, limit: int = 10) -> list[dict]:
        stmt = (
            select(Result)
            .options(selectinload(Result.quiz), selectinload(Result.subject))
            .where(Result.user_id == user_id)
            .order_by(desc(Result.created_at))
            .limit(limit)
        )
        results = (await session.execute(stmt)).scalars().all()
        return [
            {
                "id": r.id,
                "quiz": {"title": r.quiz.title if r.quiz else "N/A"},
                "subject": {"name": r.subject.name if r.subject else "N/A"},
                "grade": float(r.grade) if r.grade is not None else None,
                "created_at": r.created_at.isoformat(),
            }
            for r in results
        ]


get_result_repository = ResultRepository()
