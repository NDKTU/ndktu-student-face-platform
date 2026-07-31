from fastapi import APIRouter, Depends, Query, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.schemas import MAX_PAGE_SIZE
from app.modules.auth.model import User
from app.modules.auth.student.repository import student_repository
from app.modules.auth.student.schemas import StudentListRequest, StudentListResponse
from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired

from .repository import get_group_repository
from .schemas import (
    GroupCreateRequest,
    GroupCreateResponse,
    GroupListRequest,
    GroupListResponse,
)

router = APIRouter(
    tags=["Group"],
    prefix="/group",
)


@router.post(
    "/",
    response_model=GroupCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def create_group(
    data: GroupCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:group")),
):
    result = await get_group_repository.create_group(session=session, data=data)
    return result


@router.get("/{group_id}", response_model=GroupCreateResponse)
async def get_group(
    group_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:group")),
):
    return await get_group_repository.get_group(session=session, group_id=group_id)


@router.get("/", response_model=GroupListResponse)
async def list_groups(
    data: GroupListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("read:group")),
):
    return await get_group_repository.list_groups(session=session, request=data, current_user=current_user)


@router.get("/{group_id}/students", response_model=StudentListResponse)
async def get_group_students(
    group_id: int,
    page: int = 1,
    limit: int = Query(default=100, ge=1, le=MAX_PAGE_SIZE),
    search: str | None = None,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:student")),
):
    """Return all students belonging to the specified group."""
    request = StudentListRequest(page=page, limit=limit, search=search, group_id=group_id)
    return await student_repository.list_students(session=session, request=request)


@router.put(
    "/{group_id}",
    response_model=GroupCreateResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def update_group(
    group_id: int,
    data: GroupCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:group")),
):
    result = await get_group_repository.update_group(session=session, group_id=group_id, data=data)
    return result


@router.delete(
    "/{group_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def delete_group(
    group_id: int,
    force: bool = False,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:group")),
):
    await get_group_repository.delete_group(session=session, group_id=group_id, force=force)


@router.get("/{group_id}/delete-info")
async def get_group_delete_info(
    group_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:group")),
):
    """Returns counts of related data affected when this group is deleted."""
    from sqlalchemy import func, select

    from app.modules.auth.model import Student
    from app.modules.quiz.model import Result

    student_count = (
        await session.execute(select(func.count()).select_from(Student).where(Student.group_id == group_id))
    ).scalar() or 0
    result_count = (
        await session.execute(select(func.count()).select_from(Result).where(Result.group_id == group_id))
    ).scalar() or 0
    return {"students_count": student_count, "results_count": result_count}
