import logging

from fastapi import HTTPException, status
from sqlalchemy import asc, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.employee.model import Employee
from app.modules.group.models.group_teachers import GroupTeacher
from app.modules.result.model import Result
from app.modules.student.model import Student
from app.modules.subject.models.subject_teacher import SubjectTeacher
from app.modules.teacher.model import Teacher
from app.modules.user.models.user import User

from .schemas import (
    ResultListRequest,
    ResultListResponse,
)

logger = logging.getLogger(__name__)


class ResultRepository:
    async def get_result(self, session: AsyncSession, result_id: int) -> Result:
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
        result = await session.execute(stmt)
        obj = result.scalar_one_or_none()

        if not obj:
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

        is_admin = any(role.name.lower() == "admin" for role in current_user.roles)
        is_teacher = any(role.name.lower() == "teacher" for role in current_user.roles)
        is_student = any(role.name.lower() == "student" for role in current_user.roles)

        teacher_filter = None

        if is_admin:
            # Admins see everything, no role-based filter applied
            pass
        elif is_teacher:
            # Get teacher's assigned groups (group_teachers.teacher_id = users.id)
            gt_stmt = select(GroupTeacher.group_id).where(GroupTeacher.teacher_id == current_user.id)
            gt_result = await session.execute(gt_stmt)
            allowed_group_ids = gt_result.scalars().all()

            # Get teacher's assigned subjects (subject_teachers.teacher_id = teachers.id)
            st_stmt = (
                select(SubjectTeacher.subject_id)
                .join(Teacher, Teacher.id == SubjectTeacher.teacher_id)
                .join(Employee, Teacher.employee_id == Employee.id)
                .where(Employee.user_id == current_user.id)
            )
            st_result = await session.execute(st_stmt)
            allowed_subject_ids = st_result.scalars().all()

            if allowed_group_ids and allowed_subject_ids:
                teacher_filter = Result.group_id.in_(allowed_group_ids) & Result.subject_id.in_(allowed_subject_ids)
            elif allowed_group_ids:
                teacher_filter = Result.group_id.in_(allowed_group_ids)
            elif allowed_subject_ids:
                teacher_filter = Result.subject_id.in_(allowed_subject_ids)
            else:
                # If a teacher has no assigned groups/subjects, they see nothing
                teacher_filter = Result.id == -1

            if teacher_filter is not None:
                stmt = stmt.where(teacher_filter)

        elif is_student:
            # Students only see their own results
            stmt = stmt.where(Result.user_id == current_user.id)

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

        if is_admin:
            # Admins see everything
            pass
        elif is_teacher and teacher_filter is not None:
            count_stmt = count_stmt.where(teacher_filter)
        elif is_student:
            count_stmt = count_stmt.where(Result.user_id == current_user.id)

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

        from app.modules.user_answers.model import UserAnswers

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
                "grade": float(r.grade),
                "created_at": r.created_at.isoformat(),
            }
            for r in results
        ]


get_result_repository = ResultRepository()
