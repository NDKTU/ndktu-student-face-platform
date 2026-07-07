from __future__ import annotations

import logging

from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired
from fastapi import APIRouter, Depends, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import User

from .schemas import (
    MethodCreateRequest,
    MethodListRequest,
    MethodListResponse,
    MethodResponse,
    MethodUpdateRequest,
    QuestionCreateRequest,
    QuestionResponse,
    QuestionUpdateRequest,
    TestResultListRequest,
    TestResultListResponse,
    TestResultResponse,
    TestSubmitRequest,
)
from .service import get_psychology_service

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/psychology",
    tags=["Psychology"],
)

# ─── Method endpoints ────────────────────────────────────────────────────────


@router.post(
    "/method/",
    response_model=MethodResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def create_method(
    data: MethodCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:psychology")),
):
    return await get_psychology_service.create_method(session=session, data=data)


@router.get("/method/", response_model=MethodListResponse)
async def list_methods(
    request: MethodListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:psychology")),
):
    return await get_psychology_service.list_methods(session=session, request=request)


@router.get("/method/{method_id}", response_model=MethodResponse)
async def get_method(
    method_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:psychology")),
):
    return await get_psychology_service.get_method(session=session, method_id=method_id)


@router.put(
    "/method/{method_id}",
    response_model=MethodResponse,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def update_method(
    method_id: int,
    data: MethodUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:psychology")),
):
    return await get_psychology_service.update_method(session=session, method_id=method_id, data=data)


@router.delete(
    "/method/{method_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def delete_method(
    method_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:psychology")),
):
    await get_psychology_service.delete_method(session=session, method_id=method_id)


# ─── Question endpoints ───────────────────────────────────────────────────────


@router.post(
    "/question/",
    response_model=QuestionResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def create_question(
    data: QuestionCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:psychology")),
):
    return await get_psychology_service.create_question(session=session, data=data)


@router.get("/question/{question_id}", response_model=QuestionResponse)
async def get_question(
    question_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:psychology")),
):
    return await get_psychology_service.get_question(session=session, question_id=question_id)


@router.put(
    "/question/{question_id}",
    response_model=QuestionResponse,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def update_question(
    question_id: int,
    data: QuestionUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:psychology")),
):
    return await get_psychology_service.update_question(session=session, question_id=question_id, data=data)


@router.delete(
    "/question/{question_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def delete_question(
    question_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:psychology")),
):
    await get_psychology_service.delete_question(session=session, question_id=question_id)


# ─── Test / Result endpoints ──────────────────────────────────────────────────


@router.post(
    "/test/{method_id}/submit",
    response_model=TestResultResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def submit_test(
    method_id: int,
    data: TestSubmitRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("read:psychology")),
):
    return await get_psychology_service.submit_test(
        session=session, method_id=method_id, user_id=current_user.id, data=data
    )


@router.get("/test/results/", response_model=TestResultListResponse)
async def list_results(
    request: TestResultListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: User = Depends(PermissionRequired("read:psychology_results")),
):
    return await get_psychology_service.list_results(session=session, request=request, user_id=None)


@router.delete(
    "/test/results/{result_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def delete_result(
    result_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:psychology_results")),
):
    await get_psychology_service.delete_result(session=session, result_id=result_id)


@router.get("/test/results/{result_id}", response_model=TestResultResponse)
async def get_result(
    result_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: User = Depends(PermissionRequired("read:psychology_results")),
):
    return await get_psychology_service.get_result(session=session, result_id=result_id)
