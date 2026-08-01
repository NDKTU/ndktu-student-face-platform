from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utils.roles import is_admin as user_is_admin
from app.core.schemas import MAX_PAGE_SIZE
from app.modules.auth.model import User
from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired

from .repository import get_teacher_repository
from .schemas import (
    FacultyRankingResponse,
    KafedraRankingResponse,
    TeacherAssignedGroupsResponse,
    TeacherAssignedSubjectsResponse,
    TeacherCreateRequest,
    TeacherCreateResponse,
    TeacherGroupAssignRequest,
    TeacherListRequest,
    TeacherListResponse,
    TeacherRankingResponse,
    TeacherSubjectAssignRequest,
    TeacherUpdateRequest,
)

router = APIRouter(
    tags=["Teacher"],
    prefix="/teacher",
)


@router.post(
    "/",
    response_model=TeacherCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def create_teacher(
    data: TeacherCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:teacher")),
):
    result = await get_teacher_repository.create_teacher(session=session, data=data)
    return result


@router.get("/{teacher_id}", response_model=TeacherCreateResponse)
async def get_teacher(
    teacher_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:teacher")),
):
    return await get_teacher_repository.get_teacher(session=session, teacher_id=teacher_id)


@router.get("/", response_model=TeacherListResponse)
async def list_teachers(
    data: TeacherListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:teacher")),
):
    return await get_teacher_repository.list_teachers(session=session, request=data)


@router.put(
    "/{teacher_id}",
    response_model=TeacherCreateResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def update_teacher(
    teacher_id: int,
    data: TeacherUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:teacher")),
):
    result = await get_teacher_repository.update_teacher(session=session, teacher_id=teacher_id, data=data)
    return result


@router.delete(
    "/{teacher_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def delete_teacher(
    teacher_id: int,
    force: bool = False,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:teacher")),
):
    await get_teacher_repository.delete_teacher(session=session, teacher_id=teacher_id, force=force)


@router.post(
    "/assign_groups",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def assign_groups(
    data: TeacherGroupAssignRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:teacher")),
):
    await get_teacher_repository.assign_groups(session=session, data=data)
    return {"message": "Groups assigned successfully"}


@router.post(
    "/assign_subjects",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def assign_subjects(
    data: TeacherSubjectAssignRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:teacher")),
):
    await get_teacher_repository.assign_subjects(session=session, data=data)
    return {"message": "Subjects assigned successfully"}


@router.get(
    "/assigned_subjects/by-user/{user_id}",
    response_model=TeacherAssignedSubjectsResponse,
)
async def get_teacher_assigned_subjects(
    user_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("user:me")),
):
    is_admin = user_is_admin(current_user)
    if not is_admin and user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return await get_teacher_repository.get_assigned_subjects_by_user(session=session, user_id=user_id)


@router.get("/assigned_groups/by-user/{user_id}", response_model=TeacherAssignedGroupsResponse)
async def get_teacher_assigned_groups(
    user_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("user:me")),
):
    is_admin = user_is_admin(current_user)
    if not is_admin and user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return await get_teacher_repository.get_assigned_groups_by_user(session=session, user_id=user_id)


@router.get(
    "/ranking/overall",
    response_model=TeacherRankingResponse,
    summary="Teacher ranking — with optional filters",
)
async def teacher_ranking_overall(
    faculty_id: int | None = None,
    kafedra_id: int | None = None,
    group_id: int | None = None,
    search: str | None = None,
    page: int = 1,
    limit: int = Query(default=10, ge=1, le=MAX_PAGE_SIZE),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:teacher")),
):
    return await get_teacher_repository.get_ranking(
        session=session,
        faculty_id=faculty_id,
        kafedra_id=kafedra_id,
        group_id=group_id,
        search=search,
        page=page,
        limit=limit,
    )


@router.get(
    "/ranking/faculty",
    response_model=FacultyRankingResponse,
    summary="Faculty ranking — faculties ranked by avg student grade",
)
async def faculty_ranking(
    page: int = 1,
    limit: int = Query(default=10, ge=1, le=MAX_PAGE_SIZE),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:teacher")),
):
    return await get_teacher_repository.get_faculty_ranking(session=session, page=page, limit=limit)


@router.get(
    "/ranking/kafedra",
    response_model=KafedraRankingResponse,
    summary="Kafedra ranking — chairs ranked by avg student grade",
)
async def kafedra_ranking(
    page: int = 1,
    limit: int = Query(default=10, ge=1, le=MAX_PAGE_SIZE),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:teacher")),
):
    return await get_teacher_repository.get_kafedra_ranking(session=session, page=page, limit=limit)
