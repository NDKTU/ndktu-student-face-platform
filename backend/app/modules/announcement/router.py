from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired
from fastapi import APIRouter, Depends, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from .repository import get_announcement_repository
from .schemas import (
    AnnouncementCreateRequest,
    AnnouncementFeedRequest,
    AnnouncementListRequest,
    AnnouncementListResponse,
    AnnouncementResponse,
    AnnouncementUpdateRequest,
    AudienceOptionsResponse,
    RegistrationListResponse,
)

if TYPE_CHECKING:
    from app.modules.auth.model import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/announcement", tags=["Announcement"])


# ─── Talaba lentasi ──────────────────────────────────────────────────────────
# `/feed` boshqaruv ro'yxatidan alohida huquat bilan yopilgan: talabaga
# `read:announcement` berilsa, unga boshqaruv sahifasi ham ochilib ketardi —
# xuddi test ishlash (`quiz_process:start_quiz`) testlarni boshqarishdan
# ajratilgani kabi.


@router.get("/feed", response_model=AnnouncementListResponse)
async def feed(
    data: AnnouncementFeedRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("announcement:feed")),
):
    return await get_announcement_repository.feed(session=session, request=data, user=current_user)


@router.get("/feed/{announcement_id}", response_model=AnnouncementResponse)
async def feed_item(
    announcement_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("announcement:feed")),
):
    return await get_announcement_repository.feed_item(
        session=session, announcement_id=announcement_id, user=current_user
    )


@router.post(
    "/{announcement_id}/register",
    response_model=AnnouncementResponse,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def register(
    announcement_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("announcement:register")),
):
    return await get_announcement_repository.register(
        session=session, announcement_id=announcement_id, user=current_user
    )


@router.delete("/{announcement_id}/register", response_model=AnnouncementResponse)
async def cancel_registration(
    announcement_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("announcement:register")),
):
    return await get_announcement_repository.cancel(
        session=session, announcement_id=announcement_id, user=current_user
    )


# ─── Boshqaruv ───────────────────────────────────────────────────────────────


@router.post(
    "/",
    response_model=AnnouncementResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def create_announcement(
    data: AnnouncementCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: "User" = Depends(PermissionRequired("create:announcement")),
):
    return await get_announcement_repository.create(session=session, data=data, user=current_user)


@router.get("/", response_model=AnnouncementListResponse)
async def list_announcements(
    data: AnnouncementListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("read:announcement")),
):
    return await get_announcement_repository.list_all(session=session, request=data)


@router.get("/audience/options", response_model=AudienceOptionsResponse)
async def audience_options(
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("read:announcement")),
):
    return await get_announcement_repository.audience_options(session=session)


@router.get("/{announcement_id}", response_model=AnnouncementResponse)
async def get_announcement(
    announcement_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("read:announcement")),
):
    return await get_announcement_repository.get(session=session, announcement_id=announcement_id)


@router.patch("/{announcement_id}", response_model=AnnouncementResponse)
async def update_announcement(
    announcement_id: int,
    data: AnnouncementUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("update:announcement")),
):
    return await get_announcement_repository.update(
        session=session, announcement_id=announcement_id, data=data
    )


@router.delete("/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_announcement(
    announcement_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("delete:announcement")),
):
    await get_announcement_repository.delete(session=session, announcement_id=announcement_id)


@router.get("/{announcement_id}/registrations", response_model=RegistrationListResponse)
async def list_registrations(
    announcement_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("read:announcement_registration")),
):
    return await get_announcement_repository.list_registrations(
        session=session, announcement_id=announcement_id
    )
