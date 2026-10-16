"""EPOS yuklamasi (o'qituvchi — guruh — fan), faqat o'qish.

`auth/router.py` dan ajratilgan — u endi faqat bo'limlarni ulaydi.
"""

import logging

from app.core.database.db_helper import db_helper
from app.core.dependencies.role_checker import PermissionRequired
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import User

from app.modules.auth.teacher_assignment.repository import get_teacher_assignment_repository
from app.modules.auth.teacher_assignment.schemas import AssignmentListRequest, AssignmentListResponse

logger = logging.getLogger(__name__)


# ============================================================================
#  TEACHER ASSIGNMENT (EPOS yuklamasi)
# ============================================================================
teacher_assignment_router = APIRouter(
    tags=["Teacher assignment"],
    prefix="/teacher-assignment",
)


@teacher_assignment_router.get("/", response_model=AssignmentListResponse)
async def list_teacher_assignments(
    data: AssignmentListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("read:teacher_assignment")),
):
    """EPOS yuklamasi: kim, qaysi guruhga, qaysi fandan dars beradi.

    Faqat oʻqish. Yozish sinxronizatsiyaning ishi — bu yerdan qoʻlda
    oʻzgartirish keyingi progn tomonidan jimgina qaytarilardi.
    """
    return await get_teacher_assignment_repository.list_assignments(
        session=session, request=data, current_user=current_user
    )
