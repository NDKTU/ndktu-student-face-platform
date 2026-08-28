from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired
from fastapi import APIRouter, Depends
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import User

from .schemas import ZoomJoinRequest, ZoomJoinResponse
from .service import zoom_service

router = APIRouter(prefix="/zoom", tags=["Zoom"])


@router.post(
    "/join",
    response_model=ZoomJoinResponse,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def zoom_join(
    data: ZoomJoinRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("read:lesson")),
):
    """Meeting SDK uchun imzo va uchrashuv ma'lumotlari.

    `client_secret` javobda yo'q va hech qachon brauzerga chiqmaydi.
    """
    return await zoom_service.build_join_payload(session=session, lesson_id=data.lesson_id, user=current_user)
