"""Talabalar: ro'yxat, profil, dashboard, bejik.

`auth/router.py` dan ajratilgan — u endi faqat bo'limlarni ulaydi.
"""

import logging

from app.core.database.db_helper import db_helper
from app.core.dependencies.role_checker import AdminRequired, PermissionRequired
from fastapi import APIRouter, Depends, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import User

from app.modules.auth.student.badge import build_student_badge, load_badge_photo
from app.modules.auth.student.dashboard import build_student_dashboard
from app.modules.auth.student.repository import student_repository
from app.modules.auth.student.schemas import (
    StudentBadgeResponse,
    StudentDashboardResponse,
    StudentListRequest,
    StudentListResponse,
    StudentResponse,
#    StudentUpdateRequest,
    StudentWithUserListResponse,
)

logger = logging.getLogger(__name__)


# ============================================================================
#  STUDENT
# ============================================================================
student_router = APIRouter(prefix="/students", tags=["Students"])


@student_router.get("/with-users", response_model=StudentWithUserListResponse)
async def list_students_with_users(
    data: StudentListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("read:student")),
):
    return await student_repository.list_students_with_users(
        session=session, request=data, current_user=current_user
    )


@student_router.get("/", response_model=StudentListResponse)
async def list_students(
    data: StudentListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("read:student")),
):
    """Talabalar ro'yxati.

    O'qituvchiga faqat o'zi dars o'tadigan guruhlarning talabalari ko'rinadi
    (`StudentRepository.visible_group_ids`), admin esa hammasini ko'radi.
    """
    return await student_repository.list_students(session=session, request=data, current_user=current_user)


# "/me/..." "/{student_id}" dan oldin turadi — tartib shu yerda ham saqlanadi.
@student_router.get("/me/dashboard", response_model=StudentDashboardResponse)
async def get_my_student_dashboard(
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("student:me")),
):
    """Talabaning bosh sahifasi: davomat, baholar, darslar va uy vazifalari.

    Faqat joriy foydalanuvchining oʻzi — boshqa talabani soʻrash uchun
    parametr ataylab yoʻq. Alohida huquq (`student:me`): `read:student`
    oʻqituvchi va adminniki, u bilan talabalar roʻyxati ochilib ketardi.
    """
    return await build_student_dashboard(session=session, user=current_user)


@student_router.get("/{student_id}", response_model=StudentResponse)
async def get_student(
    student_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("read:student")),
):
    return await student_repository.get_student(session, student_id, current_user=current_user)


# Bejik — faqat admin. `read:student` yetarli emas: u Rollar oynasidan boshqa
# rollarga ham beriladi, bejik esa rasmiy hujjat sifatida chop etiladi.
@student_router.get("/{student_id}/badge", response_model=StudentBadgeResponse)
async def get_student_badge(
    student_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: User = Depends(AdminRequired()),
):
    """Talaba bejigiga chiqadigan maʼlumot: F.I.Sh., fakultet, guruh, talaba ID."""
    return await build_student_badge(session, student_id)


@student_router.get("/{student_id}/badge/photo")
async def get_student_badge_photo(
    student_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: User = Depends(AdminRequired()),
):
    """Bejik uchun talaba surati (fayl).

    Surat HEMIS'dan toʻgʻridan-toʻgʻri olinmaydi: u CORS'siz keladi va
    brauzer bunday rasmli bejikni JPG qilib saqlashga ruxsat bermaydi
    (`student/badge.py`).
    """
    content, media_type = await load_badge_photo(session, student_id)
    return Response(
        content=content,
        media_type=media_type,
        headers={"Cache-Control": "private, max-age=300"},
    )


# EPOS/HEMIS bilan boshqariladigan maʼlumot: bu endpoint 2026-09-11 da
# kommentga olindi — entity platformada yaratilmaydi, oʻzgartirilmaydi va
# oʻchirilmaydi. Qaytarish kerak boʻlsa — kommentni olib tashlash kifoya.
# @student_router.put(
#     "/{student_id}",
#     response_model=StudentResponse,
#     dependencies=[Depends(RateLimiter(times=5, seconds=60))],
# )
# async def update_student(
#     student_id: int,
#     data: StudentUpdateRequest,
#     session: AsyncSession = Depends(db_helper.session_getter),
#     _: PermissionRequired = Depends(PermissionRequired("update:student")),
# ):
#     result = await student_repository.update_student(session, student_id, data)
#     return result


# EPOS/HEMIS bilan boshqariladigan maʼlumot: bu endpoint 2026-09-11 da
# kommentga olindi — entity platformada yaratilmaydi, oʻzgartirilmaydi va
# oʻchirilmaydi. Qaytarish kerak boʻlsa — kommentni olib tashlash kifoya.
# @student_router.delete(
#     "/{student_id}",
#     status_code=status.HTTP_204_NO_CONTENT,
#     dependencies=[Depends(RateLimiter(times=5, seconds=60))],
# )
# async def delete_student(
#     student_id: int,
#     force: bool = False,
#     session: AsyncSession = Depends(db_helper.session_getter),
#     _: PermissionRequired = Depends(PermissionRequired("delete:student")),
# ):
#     await student_repository.delete_student(session, student_id, force)
