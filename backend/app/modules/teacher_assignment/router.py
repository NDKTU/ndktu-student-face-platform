import logging

from core.db_helper import db_helper
from dependence.role_checker import PermissionRequired
from fastapi import APIRouter, Depends, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from .repository import get_teacher_assignment_repository
from .schemas import (
    TeacherAssignmentCreateRequest,
    TeacherAssignmentListRequest,
    TeacherAssignmentListResponse,
    TeacherAssignmentResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    tags=["TeacherAssignment"],
    prefix="/teacher-assignment",
)


@router.post(
    "/",
    response_model=TeacherAssignmentResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def create_assignment(
    data: TeacherAssignmentCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:teacher_assignment")),
):
    return await get_teacher_assignment_repository.create_assignment(session=session, data=data)


@router.get("/", response_model=TeacherAssignmentListResponse)
async def list_assignments(
    data: TeacherAssignmentListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:teacher_assignment")),
):
    return await get_teacher_assignment_repository.list_assignments(session=session, request=data)


@router.delete(
    "/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def delete_assignment(
    assignment_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:teacher_assignment")),
):
    await get_teacher_assignment_repository.delete_assignment(session=session, assignment_id=assignment_id)
