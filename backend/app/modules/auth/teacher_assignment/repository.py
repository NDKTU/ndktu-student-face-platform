import logging

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.auth.model import TeacherAssignment

from .schemas import (
    TeacherAssignmentCreateRequest,
    TeacherAssignmentListRequest,
    TeacherAssignmentListResponse,
    TeacherAssignmentResponse,
)

logger = logging.getLogger(__name__)


class TeacherAssignmentRepository:
    async def _load(self, session: AsyncSession, assignment_id: int) -> TeacherAssignment:
        stmt = (
            select(TeacherAssignment)
            .options(
                selectinload(TeacherAssignment.teacher),
                selectinload(TeacherAssignment.subject),
                selectinload(TeacherAssignment.group),
            )
            .where(TeacherAssignment.id == assignment_id)
        )
        obj = (await session.execute(stmt)).scalar_one_or_none()
        if not obj:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
        return obj

    async def create_assignment(
        self, session: AsyncSession, data: TeacherAssignmentCreateRequest
    ) -> TeacherAssignmentResponse:
        stmt_check = select(TeacherAssignment).where(
            TeacherAssignment.teacher_id == data.teacher_id,
            TeacherAssignment.subject_id == data.subject_id,
            TeacherAssignment.group_id == data.group_id,
        )
        if (await session.execute(stmt_check)).scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Assignment already exists for this teacher/subject/group combination",
            )

        assignment = TeacherAssignment(
            teacher_id=data.teacher_id,
            subject_id=data.subject_id,
            group_id=data.group_id,
        )
        session.add(assignment)

        try:
            await session.commit()
        except IntegrityError as e:
            await session.rollback()
            logger.warning("Integrity error creating teacher assignment: %s", e)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Invalid teacher_id, subject_id, or group_id",
            )
        except Exception as e:
            await session.rollback()
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

        loaded = await self._load(session, assignment.id)
        return TeacherAssignmentResponse.model_validate(loaded)

    async def list_assignments(
        self, session: AsyncSession, request: TeacherAssignmentListRequest
    ) -> TeacherAssignmentListResponse:
        stmt = select(TeacherAssignment).options(
            selectinload(TeacherAssignment.teacher),
            selectinload(TeacherAssignment.subject),
            selectinload(TeacherAssignment.group),
        )
        count_stmt = select(func.count()).select_from(TeacherAssignment)

        if request.teacher_id:
            stmt = stmt.where(TeacherAssignment.teacher_id == request.teacher_id)
            count_stmt = count_stmt.where(TeacherAssignment.teacher_id == request.teacher_id)
        if request.subject_id:
            stmt = stmt.where(TeacherAssignment.subject_id == request.subject_id)
            count_stmt = count_stmt.where(TeacherAssignment.subject_id == request.subject_id)
        if request.group_id:
            stmt = stmt.where(TeacherAssignment.group_id == request.group_id)
            count_stmt = count_stmt.where(TeacherAssignment.group_id == request.group_id)

        stmt = stmt.order_by(desc(TeacherAssignment.created_at)).offset(request.offset).limit(request.limit)
        assignments = (await session.execute(stmt)).scalars().all()
        total = (await session.execute(count_stmt)).scalar() or 0

        return TeacherAssignmentListResponse(
            total=total,
            page=request.page,
            limit=request.limit,
            assignments=[TeacherAssignmentResponse.model_validate(a) for a in assignments],
        )

    async def delete_assignment(self, session: AsyncSession, assignment_id: int) -> None:
        obj = await self._load(session, assignment_id)
        await session.delete(obj)
        await session.commit()


get_teacher_assignment_repository = TeacherAssignmentRepository()
