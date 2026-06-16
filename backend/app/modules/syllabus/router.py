from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from core.db_helper import db_helper
from dependence.role_checker import PermissionRequired
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from .repository import get_syllabus_repository
from .schemas import SyllabusResponse, SyllabusUpsertRequest

if TYPE_CHECKING:
    from app.modules.user.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Syllabus"], prefix="/syllabus")


@router.get("/{course_id}", response_model=SyllabusResponse)
async def get_syllabus(
    course_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("read:syllabus")),
):
    s = await get_syllabus_repository.get(session=session, course_id=course_id)
    if not s:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Syllabus not found")
    return s


@router.put(
    "/{course_id}",
    response_model=SyllabusResponse,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def upsert_syllabus(
    course_id: int,
    data: SyllabusUpsertRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("update:syllabus")),
):
    return await get_syllabus_repository.upsert(session=session, course_id=course_id, data=data, current_user=current_user)


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_syllabus(
    course_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("delete:syllabus")),
):
    await get_syllabus_repository.delete(session=session, course_id=course_id, current_user=current_user)
