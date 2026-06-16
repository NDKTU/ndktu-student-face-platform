import logging

from core.db_helper import db_helper
from dependence.role_checker import PermissionRequired
from fastapi import APIRouter, Depends, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from .repository import get_education_plan_repository
from .schemas import (
    EducationPlanCreateRequest,
    EducationPlanListRequest,
    EducationPlanListResponse,
    EducationPlanResponse,
    EducationPlanSubjectCreateRequest,
    EducationPlanUpdateRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    tags=["EducationPlan"],
    prefix="/education-plan",
)


@router.post(
    "/",
    response_model=EducationPlanResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def create_plan(
    data: EducationPlanCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:education_plan")),
):
    return await get_education_plan_repository.create_plan(session=session, data=data)


@router.get("/", response_model=EducationPlanListResponse)
async def list_plans(
    data: EducationPlanListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:education_plan")),
):
    return await get_education_plan_repository.list_plans(session=session, request=data)


@router.get("/{plan_id}", response_model=EducationPlanResponse)
async def get_plan(
    plan_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:education_plan")),
):
    return await get_education_plan_repository.get_plan(session=session, plan_id=plan_id)


@router.put(
    "/{plan_id}",
    response_model=EducationPlanResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def update_plan(
    plan_id: int,
    data: EducationPlanUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:education_plan")),
):
    return await get_education_plan_repository.update_plan(session=session, plan_id=plan_id, data=data)


@router.delete(
    "/{plan_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def delete_plan(
    plan_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:education_plan")),
):
    await get_education_plan_repository.delete_plan(session=session, plan_id=plan_id)


@router.post(
    "/{plan_id}/subjects",
    response_model=EducationPlanResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def add_subject_to_plan(
    plan_id: int,
    data: EducationPlanSubjectCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:education_plan")),
):
    return await get_education_plan_repository.add_subject(session=session, plan_id=plan_id, data=data)


@router.delete(
    "/{plan_id}/subjects/{plan_subject_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def remove_subject_from_plan(
    plan_id: int,
    plan_subject_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:education_plan")),
):
    await get_education_plan_repository.remove_subject(
        session=session, plan_id=plan_id, plan_subject_id=plan_subject_id
    )
