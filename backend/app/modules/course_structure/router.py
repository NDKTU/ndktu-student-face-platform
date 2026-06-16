from __future__ import annotations

import logging
from typing import TYPE_CHECKING, List

from core.db_helper import db_helper
from dependence.role_checker import PermissionRequired
from fastapi import APIRouter, Depends, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from .repository import get_course_structure_repository
from .schemas import (
    ModuleCreateRequest,
    ModuleListResponse,
    ModuleResponse,
    ModuleUpdateRequest,
    ReorderRequest,
    TopicCreateRequest,
    TopicResponse,
    TopicUpdateRequest,
)

if TYPE_CHECKING:
    from app.modules.user.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["CourseStructure"])

module_router = APIRouter(prefix="/module")
topic_router = APIRouter(prefix="/topic")


# ── Modules ─────────────────────────────────────────────────────────────


@module_router.get("/", response_model=ModuleListResponse)
async def list_modules(
    course_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("read:module")),
):
    return await get_course_structure_repository.list_modules(session=session, course_id=course_id)


@module_router.post(
    "/",
    response_model=ModuleResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def create_module(
    data: ModuleCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("create:module")),
):
    return await get_course_structure_repository.create_module(session=session, data=data, current_user=current_user)


@module_router.put("/{module_id}", response_model=ModuleResponse)
async def update_module(
    module_id: int,
    data: ModuleUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("update:module")),
):
    return await get_course_structure_repository.update_module(
        session=session, module_id=module_id, data=data, current_user=current_user
    )


@module_router.delete("/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_module(
    module_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("delete:module")),
):
    await get_course_structure_repository.delete_module(session=session, module_id=module_id, current_user=current_user)


@module_router.put("/reorder/{course_id}", response_model=ModuleListResponse)
async def reorder_modules(
    course_id: int,
    data: ReorderRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("update:module")),
):
    return await get_course_structure_repository.reorder_modules(
        session=session, course_id=course_id, data=data, current_user=current_user
    )


# ── Topics ──────────────────────────────────────────────────────────────


@topic_router.post(
    "/",
    response_model=TopicResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=30, seconds=60))],
)
async def create_topic(
    data: TopicCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("create:topic")),
):
    return await get_course_structure_repository.create_topic(session=session, data=data, current_user=current_user)


@topic_router.put("/{topic_id}", response_model=TopicResponse)
async def update_topic(
    topic_id: int,
    data: TopicUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("update:topic")),
):
    return await get_course_structure_repository.update_topic(
        session=session, topic_id=topic_id, data=data, current_user=current_user
    )


@topic_router.delete("/{topic_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_topic(
    topic_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("delete:topic")),
):
    await get_course_structure_repository.delete_topic(session=session, topic_id=topic_id, current_user=current_user)


@topic_router.put("/reorder/{module_id}", response_model=List[TopicResponse])
async def reorder_topics(
    module_id: int,
    data: ReorderRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("update:topic")),
):
    return await get_course_structure_repository.reorder_topics(
        session=session, module_id=module_id, data=data, current_user=current_user
    )


router.include_router(module_router)
router.include_router(topic_router)
