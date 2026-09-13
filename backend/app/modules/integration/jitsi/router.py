from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired
from fastapi import APIRouter, Depends
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import User

from .schemas import JitsiJoinRequest, JitsiJoinResponse
from .service import jitsi_service

router = APIRouter(prefix="/jitsi", tags=["Jitsi"])


@router.post(
    "/join",
    response_model=JitsiJoinResponse,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def jitsi_join(
    data: JitsiJoinRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("read:lesson")),
):
    """Jitsi xonasi ma'lumotlari (Zoom yonidagi muqobil, sinov uchun)."""
    return await jitsi_service.build_join_payload(session=session, lesson_id=data.lesson_id, user=current_user)
