from __future__ import annotations

from typing import TYPE_CHECKING

from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.schemas import MAX_PAGE_SIZE

from .repository import get_assignment_repository
from .schemas import (
    AssignmentCreateRequest,
    AssignmentListRequest,
    AssignmentListResponse,
    AssignmentResponse,
    AssignmentUpdateRequest,
    PendingSubmissionListResponse,
    SubmissionGradeRequest,
    SubmissionListResponse,
    SubmissionResponse,
    SubmissionSubmitRequest,
)

if TYPE_CHECKING:
    from app.modules.auth.user.model import User


router = APIRouter(tags=["Assignment"], prefix="/assignment")


@router.post(
    "/",
    response_model=AssignmentResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def create_assignment(
    data: AssignmentCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("create:assignment")),
):
    return await get_assignment_repository.create_assignment(session=session, data=data, current_user=current_user)


@router.get("/", response_model=AssignmentListResponse)
async def list_assignments(
    data: AssignmentListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("read:assignment")),
):
    return await get_assignment_repository.list_assignments(session=session, request=data, current_user=current_user)


@router.get("/pending", response_model=PendingSubmissionListResponse)
async def list_pending_submissions(
    limit: int = Query(default=20, ge=1, le=MAX_PAGE_SIZE),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("read:assignment")),
):
    return await get_assignment_repository.list_pending(
        session=session, current_user=current_user, limit=limit
    )


@router.get("/{assignment_id}", response_model=AssignmentResponse)
async def get_assignment(
    assignment_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("read:assignment")),
):
    return await get_assignment_repository.get_assignment(
        session=session, assignment_id=assignment_id, current_user=current_user
    )


@router.put("/{assignment_id}", response_model=AssignmentResponse)
async def update_assignment(
    assignment_id: int,
    data: AssignmentUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("update:assignment")),
):
    return await get_assignment_repository.update_assignment(
        session=session, assignment_id=assignment_id, data=data, current_user=current_user
    )


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assignment(
    assignment_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("delete:assignment")),
):
    await get_assignment_repository.delete_assignment(
        session=session, assignment_id=assignment_id, current_user=current_user
    )


@router.post(
    "/{assignment_id}/submit",
    response_model=SubmissionResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def submit_assignment(
    assignment_id: int,
    data: SubmissionSubmitRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("create:submission")),
):
    return await get_assignment_repository.submit(
        session=session, assignment_id=assignment_id, data=data, current_user=current_user
    )


@router.get("/{assignment_id}/my-submission", response_model=SubmissionResponse)
async def get_my_submission(
    assignment_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("read:submission")),
):
    s = await get_assignment_repository.get_my_submission(
        session=session, assignment_id=assignment_id, current_user=current_user
    )
    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No submission yet")
    return s


@router.get("/{assignment_id}/submissions", response_model=SubmissionListResponse)
async def list_submissions(
    assignment_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("read:submission")),
):
    return await get_assignment_repository.list_submissions(
        session=session, assignment_id=assignment_id, current_user=current_user
    )


@router.put(
    "/{assignment_id}/submission/{user_id}/grade",
    response_model=SubmissionResponse,
    dependencies=[Depends(RateLimiter(times=30, seconds=60))],
)
async def grade_submission(
    assignment_id: int,
    user_id: int,
    data: SubmissionGradeRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("update:submission")),
):
    return await get_assignment_repository.grade_submission(
        session=session,
        assignment_id=assignment_id,
        user_id=user_id,
        data=data,
        current_user=current_user,
    )
