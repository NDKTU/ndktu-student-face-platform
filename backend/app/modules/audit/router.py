from __future__ import annotations

from typing import TYPE_CHECKING

from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from . import repository
from .schemas import AuditEventOption, AuditListRequest, AuditListResponse

if TYPE_CHECKING:
    from app.modules.auth.model import User

# Jurnal — ma'muriyat ishi. `read:audit` yangi ruxsat: ishga tushishda
# route'lardan topiladi va Admin roliga avtomatik beriladi
# (`core/lifespan/discovery.py`), boshqa rollarga qo'lda beriladi.
router = APIRouter(tags=["Audit"], prefix="/audit")


@router.get("/", response_model=AuditListResponse)
async def list_logs(
    data: AuditListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("read:audit")),
):
    return await repository.list_logs(session, data)


@router.get("/events", response_model=list[AuditEventOption])
async def list_events(
    session: AsyncSession = Depends(db_helper.session_getter),
    _: "User" = Depends(PermissionRequired("read:audit")),
):
    """Filtr uchun hodisalar ro'yxati — bazada uchraganlari."""
    return await repository.list_event_options(session)
