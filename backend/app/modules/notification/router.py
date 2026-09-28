from __future__ import annotations

from core.database.db_helper import db_helper
from core.dependencies.role_checker import get_current_user_id
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from . import repository
from .schemas import (
    MarkReadResponse,
    NotificationListResponse,
    UnreadCountResponse,
)

# Rol tekshiruvi yo'q: bildirishnoma har bir kirgan foydalanuvchining o'ziga
# tegishli va so'rovlar `user_id` bo'yicha cheklangan. `PermissionRequired`
# bo'lsa, har yangi rol uchun ruxsat qo'shish kerak bo'lardi.
router = APIRouter(tags=["Notification"], prefix="/notification")


@router.get("/", response_model=NotificationListResponse)
async def list_notifications(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    only_unread: bool = Query(False),
    session: AsyncSession = Depends(db_helper.session_getter),
    user_id: int = Depends(get_current_user_id),
):
    return await repository.list_notifications(
        session, user_id=user_id, page=page, limit=limit, only_unread=only_unread
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    session: AsyncSession = Depends(db_helper.session_getter),
    user_id: int = Depends(get_current_user_id),
):
    return UnreadCountResponse(unread=await repository.unread_count(session, user_id))


@router.post("/{notification_id}/read", response_model=MarkReadResponse)
async def mark_read(
    notification_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    user_id: int = Depends(get_current_user_id),
):
    updated = await repository.mark_read(session, user_id=user_id, notification_id=notification_id)
    if updated == 0:
        # Yo'q, boshqa odamning, yoki allaqachon o'qilgan — uchalasi ham
        # chaqiruvchi uchun bir xil: o'zgartirish bo'lmadi. Farqni aytish
        # boshqa odamning bildirishnomasi borligini oshkor qilardi.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bildirishnoma topilmadi yoki allaqachon o'qilgan",
        )
    return MarkReadResponse(updated=updated)


@router.post("/read-all", response_model=MarkReadResponse)
async def mark_all_read(
    session: AsyncSession = Depends(db_helper.session_getter),
    user_id: int = Depends(get_current_user_id),
):
    return MarkReadResponse(updated=await repository.mark_all_read(session, user_id=user_id))
