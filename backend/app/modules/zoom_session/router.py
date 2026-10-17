from datetime import date
from typing import Literal

from app.core.database.db_helper import db_helper
from app.core.dependencies.role_checker import PermissionRequired
from app.core.utils.rate_limit import user_identifier
from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import FileResponse
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import User
from app.modules.general_test.repository import get_general_test_repository
from app.modules.general_test.schemas import FilterOptionsResponse, GroupOptionListResponse

from .pairs import pair_times
from .repository import zoom_session_repository as repo
from .schemas import (
    FaceCheckReportResponse,
    FaceCheckRequest,
    FaceCheckResponse,
    PairTimeListResponse,
    ZoomCapabilitiesResponse,
    ZoomJoinResponse,
    ZoomSeriesRequest,
    ZoomSeriesResponse,
    ZoomSeriesUpdateResponse,
    ZoomSessionListResponse,
    ZoomSessionRequest,
    ZoomSessionResponse,
    ZoomStartResponse,
    ZoomSubjectOptionListResponse,
    ZoomTeacherLoadResponse,
    ZoomTeacherOptionListResponse,
)

# Ruxsatlar `PermissionRequired` dan topiladi (discovery) va Admin'ga
# avtomatik beriladi. Talabaga `read:zoom_session` va `join:zoom_session`
# — `core/lifespan/defaults.py`; boshqaruv ruxsatlarini rollarga admin
# o'zi biriktiradi.
router = APIRouter(prefix="/zoom-sessions", tags=["Zoom sessions"])


# Statik yo'llar — `/{session_id}` dan oldin.


@router.get("/group-options", response_model=GroupOptionListResponse)
async def group_options(
    search: str | None = None,
    faculty_id: int | None = None,
    course: int | None = Query(None, ge=1, le=7),
    limit: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: User = Depends(PermissionRequired("create:zoom_session")),
):
    """Seansga guruh tanlash — elementar testdagi bilan bir xil ro'yxat."""
    return await get_general_test_repository.group_options(
        session=session, search=search, faculty_id=faculty_id, course=course, limit=limit
    )


@router.get("/filter-options", response_model=FilterOptionsResponse)
async def filter_options(
    session: AsyncSession = Depends(db_helper.session_getter),
    _: User = Depends(PermissionRequired("create:zoom_session")),
):
    """Guruh tanlashdagi fakultet filtri uchun."""
    return await get_general_test_repository.filter_options(session=session)


@router.get("/teacher-options", response_model=ZoomTeacherOptionListResponse)
async def teacher_options(
    search: str | None = None,
    limit: int = Query(30, ge=1, le=100),
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("create:zoom_session")),
):
    """Seansga o'qituvchi tanlash. O'qituvchi o'zi yaratsa — faqat o'zi (`locked`).

    O'z endpointi: umumiy o'qituvchilar ro'yxati `read:teacher` ni talab
    qiladi, seans tuzuvchida esa u bo'lmasligi mumkin.
    """
    return await repo.teacher_options(session=session, user=user, search=search, limit=limit)


@router.get("/teacher-subjects", response_model=ZoomSubjectOptionListResponse)
async def teacher_subjects(
    teacher_user_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("create:zoom_session")),
):
    """Tanlangan o'qituvchining fanlari — seansning fani shulardan."""
    return await repo.teacher_subjects(session=session, user=user, teacher_user_id=teacher_user_id)


@router.get("/teacher-load", response_model=ZoomTeacherLoadResponse)
async def teacher_load(
    teacher_user_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("create:zoom_session")),
):
    """O'qituvchining yuklamasi (fan + guruh + tur) — formada guruh va fan shundan tanlanadi."""
    return await repo.teacher_load(session=session, user=user, teacher_user_id=teacher_user_id)


@router.get("/capabilities", response_model=ZoomCapabilitiesResponse)
async def capabilities(
    session: AsyncSession = Depends(db_helper.session_getter),
    _: User = Depends(PermissionRequired("create:zoom_session")),
):
    """Formada: «Zoom'da avtomatik yaratish» va akkauntlar ro'yxati (sirlarsiz)."""
    return await repo.capabilities(session)


@router.get("/pair-times", response_model=PairTimeListResponse)
async def list_pair_times(
    session: AsyncSession = Depends(db_helper.session_getter),
    _: User = Depends(PermissionRequired("read:zoom_session")),
):
    """Juftliklar vaqti — forma vaqtni «2-juftlik» kabi bir bosishda qo'yishi uchun."""
    return PairTimeListResponse(pairs=await pair_times(session))


@router.get("/face-check/{check_id}/image")
async def face_check_image(
    check_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("read:zoom_report")),
):
    """Muammoli kadr: har so'rovda ruxsat tekshiriladi."""
    path = await repo.image_path(session=session, check_id=check_id, user=user)
    return FileResponse(path, media_type="image/jpeg")


@router.get("/", response_model=ZoomSessionListResponse)
async def list_sessions(
    scope: Literal["now", "upcoming", "past"] | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("read:zoom_session")),
):
    """`date_from`/`date_to` — kalendar (Toshkent sanalari, ≤ 62 kun); berilsa `scope` e'tiborga olinmaydi."""
    return await repo.list_sessions(session=session, user=user, scope=scope, date_from=date_from, date_to=date_to)


@router.post("/", response_model=ZoomSessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    data: ZoomSessionRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("create:zoom_session")),
):
    return await repo.create_session(session=session, data=data, user=user)


@router.post("/series", response_model=ZoomSeriesResponse, status_code=status.HTTP_201_CREATED)
async def create_series(
    data: ZoomSeriesRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("create:zoom_session")),
):
    """Har hafta / har 2 haftada takrorlanadigan seanslar — har sana alohida seans."""
    return await repo.create_series(session=session, data=data, user=user)


@router.get("/{session_id}", response_model=ZoomSessionResponse)
async def get_session(
    session_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("read:zoom_session")),
):
    return await repo.get_session(session=session, session_id=session_id, user=user)


@router.put("/{session_id}", response_model=ZoomSessionResponse)
async def update_session(
    session_id: int,
    data: ZoomSessionRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("update:zoom_session")),
):
    return await repo.update_session(session=session, session_id=session_id, data=data, user=user)


@router.put("/{session_id}/following", response_model=ZoomSeriesUpdateResponse)
async def update_following(
    session_id: int,
    data: ZoomSessionRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("update:zoom_session")),
):
    """Shu seans va seriyadagi keyingilari: vaqt siljish sifatida qo'llanadi."""
    return await repo.update_following(session=session, session_id=session_id, data=data, user=user)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: int,
    scope: Literal["one", "following"] = "one",
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("delete:zoom_session")),
):
    """`scope=following` — shu seans va seriyadagi keyingilari."""
    await repo.delete_session(session=session, session_id=session_id, user=user, scope=scope)


@router.post(
    "/{session_id}/face-check",
    response_model=FaceCheckResponse,
    # Kalit foydalanuvchi bo'yicha: auditoriya bitta NAT IP orqasida.
    # Daqiqada ~1 tasodifiy tekshiruv + kirishdagi qayta urinishlar.
    dependencies=[Depends(RateLimiter(times=20, seconds=60, identifier=user_identifier))],
)
async def face_check(
    session_id: int,
    data: FaceCheckRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("join:zoom_session")),
):
    """Yuz tekshiruvi: `join` — kirishdan oldin (imzo shunga bog'liq), `random` — dars davomida."""
    return await repo.run_check(session=session, session_id=session_id, data=data, user=user)


@router.post(
    "/{session_id}/join",
    response_model=ZoomJoinResponse,
    dependencies=[Depends(RateLimiter(times=20, seconds=60, identifier=user_identifier))],
)
async def join(
    session_id: int,
    app: bool = False,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("join:zoom_session")),
):
    """Meeting SDK imzosi: guruh, vaqt va yuz tasdig'idan keyin. Sir brauzerga chiqmaydi.

    `app=1` — telefondan: qo'shimcha ravishda Zoom ilovasi uchun shaxsiy havola.
    """
    return await repo.join(session=session, session_id=session_id, user=user, app=app)


@router.post("/{session_id}/start", response_model=ZoomStartResponse)
async def start(
    session_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("join:zoom_session")),
):
    """Host sifatida boshlash havolasi — yaratuvchi, biriktirilgan o'qituvchi va adminga.

    Ruxsat `join:zoom_session`: admin seansni o'qituvchiga biriktirsa, o'qituvchida
    `create:zoom_session` bo'lmasligi mumkin. Kimligini repozitoriy tekshiradi.
    """
    return await repo.start(session=session, session_id=session_id, user=user)


@router.get("/{session_id}/report", response_model=FaceCheckReportResponse)
async def report(
    session_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("read:zoom_report")),
):
    return await repo.report(session=session, session_id=session_id, user=user)
