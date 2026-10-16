"""HEMIS: kirish, OAuth, talabalar importi, dars jadvali.

`auth/router.py` dan ajratilgan — u endi faqat bo'limlarni ulaydi.
"""

import logging

from app.core.config import settings
from app.core.database.db_helper import db_helper
from app.core.dependencies.role_checker import PermissionRequired
from app.modules.audit import service as audit_service
from app.modules.audit.model import AuditEvent
from fastapi import APIRouter, Depends, Request
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import User

from app.modules.auth.hemis.schemas import (
    GroupMatchApplyRequest,
    GroupMatchApplyResponse,
    GroupMatchPreviewResponse,
    HemisDataProbeResponse,
    HemisDataSettingsIn,
    HemisDataSettingsOut,
    StudentSyncApplyRequest,
    StudentSyncApplyResponse,
    StudentSyncPreviewResponse,
    HemisLoginRequest,
    HemisLoginResponse,
    HemisOAuthAuthorizeResponse,
    HemisOAuthCallbackRequest,
    HemisOAuthPortal,
    HemisOAuthPortalsResponse,
    HemisPreviewResponse,
    HemisSyncResponse,
    MyScheduleRequest,
    MyScheduleResponse,
    ScheduleFiltersRequest,
    ScheduleFiltersResponse,
    ScheduleListRequest,
    ScheduleListResponse,
    ScheduleSyncRequest,
    ScheduleSyncResponse,
)
from app.modules.auth.hemis import data_credentials as hemis_data_credentials
from app.modules.auth.hemis.data_service import hemis_data_service
from app.modules.auth.hemis.oauth import hemis_oauth_service
from app.modules.auth.hemis.schedule_repository import hemis_schedule_repository
from app.modules.auth.hemis.schedule_sync import hemis_schedule_sync
from app.modules.auth.hemis.student_sync import hemis_student_sync
from app.modules.auth.hemis.student_sync_runner import student_sync_runner
from app.modules.auth.hemis.service import hemis_service
from app.modules.auth.user.service import auth_service
from app.modules.auth.login_limit import hemis_login_rate_limit_identifier

logger = logging.getLogger(__name__)


# ============================================================================
#  HEMIS
# ============================================================================
hemis_router = APIRouter(prefix="/hemis", tags=["Hemis"])


@hemis_router.post(
    "/login",
    response_model=HemisLoginResponse,
    dependencies=[Depends(RateLimiter(times=60, seconds=60, identifier=hemis_login_rate_limit_identifier))],
)
async def hemis_login(
    data: HemisLoginRequest,
    request: Request,
    session: AsyncSession = Depends(db_helper.session_getter),
):
    # Talabalar va o'qituvchilarning asosiy kirish yo'li. `hemis_login`
    # ichida uchta tarmoq bor (mahalliy parol, talabalar HEMIS'i,
    # xodimlar HEMIS'i) — ularni alohida o'rash o'rniga natija bo'yicha
    # bir joyda qayd etamiz.
    try:
        result = await hemis_service.hemis_login(session=session, data=data)
    except Exception as exc:
        await audit_service.record_standalone(
            event=AuditEvent.LOGIN_FAILED,
            username=data.login,
            summary=f"Kirish muvaffaqiyatsiz: {data.login}",
            meta={"method": "hemis", "reason": getattr(exc, "detail", None) or type(exc).__name__},
            request=request,
        )
        raise

    user = await auth_service.get_user_by_username(session, data.login)
    await audit_service.record_standalone(
        event=AuditEvent.LOGIN,
        user_id=user.id if user else None,
        username=data.login,
        summary=f"Tizimga kirdi: {data.login}",
        meta={"method": "hemis"},
        request=request,
    )
    return result


# OAuth: parolni odam HEMIS sahifasida kiritadi, bizning server faqat kodni
# tokenga almashtiradi. Login bo'yicha HEMIS limiti (429 CAPTCHA_REQUIRED)
# shunda serverimiz IP'siga emas, har bir odamning o'ziga tushadi.
# Bizning limit IP bo'yicha va keng: auditoriya bitta NAT ortida, `state`
# esa bir martalik — parol tanlashga bu yerda imkon yo'q.
@hemis_router.get("/oauth/portals", response_model=HemisOAuthPortalsResponse)
async def hemis_oauth_portals():
    return HemisOAuthPortalsResponse(portals=list(settings.hemis.oauth_portals()))


@hemis_router.get(
    "/oauth/authorize",
    response_model=HemisOAuthAuthorizeResponse,
    dependencies=[Depends(RateLimiter(times=120, seconds=60))],
)
async def hemis_oauth_authorize(portal: HemisOAuthPortal = "student"):
    return HemisOAuthAuthorizeResponse(url=await hemis_oauth_service.authorize_url(portal))


@hemis_router.post(
    "/oauth/callback",
    response_model=HemisLoginResponse,
    dependencies=[Depends(RateLimiter(times=120, seconds=60))],
)
async def hemis_oauth_callback(
    data: HemisOAuthCallbackRequest,
    request: Request,
    session: AsyncSession = Depends(db_helper.session_getter),
):
    try:
        user, result = await hemis_oauth_service.complete(session=session, code=data.code, state=data.state)
    except Exception as exc:
        detail = getattr(exc, "detail", None)
        reason = detail.get("code") if isinstance(detail, dict) else detail
        await audit_service.record_standalone(
            event=AuditEvent.LOGIN_FAILED,
            username=None,
            summary="HEMIS OAuth orqali kirish muvaffaqiyatsiz",
            meta={"method": "hemis_oauth", "reason": reason or type(exc).__name__},
            request=request,
        )
        raise

    await audit_service.record_standalone(
        event=AuditEvent.LOGIN,
        user_id=user.id,
        username=user.username,
        summary=f"Tizimga kirdi (HEMIS OAuth): {user.username}",
        meta={"method": "hemis_oauth"},
        request=request,
    )
    return result


@hemis_router.post(
    "/preview",
    response_model=HemisPreviewResponse,
    dependencies=[Depends(PermissionRequired("hemis_admin_preview"))],
)
async def preview_hemis_data(
    data: HemisLoginRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
):
    return await hemis_service.preview_hemis_data(session=session, data=data)


@hemis_router.post(
    "/sync",
    response_model=HemisSyncResponse,
    dependencies=[Depends(PermissionRequired("hemis_admin_sync"))],
)
async def sync_hemis_data(
    data: HemisLoginRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
):
    return await hemis_service.sync_hemis_data(session=session, data=data)


# ── Ma'lumot API (token) ─────────────────────────────────────────────────────


@hemis_router.get("/data-settings", response_model=HemisDataSettingsOut)
async def get_hemis_data_settings(
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("hemis_admin_sync")),
):
    """Token holati. Tokenning o'zi qaytarilmaydi — faqat oxirgi to'rt belgisi."""
    return await hemis_data_credentials.masked(session)


@hemis_router.put("/data-settings", response_model=HemisDataSettingsOut)
async def save_hemis_data_settings(
    data: HemisDataSettingsIn,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("hemis_admin_sync")),
):
    await hemis_data_credentials.upsert(session, data, current_user.id)
    return await hemis_data_credentials.masked(session)


@hemis_router.post("/data-settings/test", response_model=HemisDataProbeResponse)
async def test_hemis_data_token(
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("hemis_admin_sync")),
):
    """Bitta yozuv so'raladi: token tirikmi va HEMIS nechta faol talaba beradi."""
    return await hemis_data_service.probe(session)


# ── Guruhlarni bog'lash ──────────────────────────────────────────────────────


@hemis_router.post(
    "/groups/match/preview",
    response_model=GroupMatchPreviewResponse,
    dependencies=[Depends(RateLimiter(times=3, seconds=300))],
)
async def preview_hemis_group_match(
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("hemis_admin_sync")),
):
    """HEMIS guruhlarini bizdagi guruhlar bilan solishtiradi.

    Hech narsa yozmaydi: to'liq o'tish (49 sahifa, ~50 soniya) va takliflar
    Redis'ga `run_id` ostida muzlatiladi. Chegara qattiq — bu og'ir so'rov.
    """
    return await hemis_data_service.group_match_preview(session)


@hemis_router.post("/groups/match/apply", response_model=GroupMatchApplyResponse)
async def apply_hemis_group_match(
    data: GroupMatchApplyRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("hemis_admin_sync")),
):
    """Tasdiqlangan juftliklarni `groups.hemis_group_id` ga yozadi."""
    return await hemis_data_service.group_match_apply(session, data)


# ── Talabalar importi ────────────────────────────────────────────────────────


@hemis_router.post(
    "/students/preview",
    response_model=StudentSyncPreviewResponse,
    dependencies=[Depends(RateLimiter(times=3, seconds=300))],
)
async def preview_hemis_students(
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("hemis_admin_sync")),
):
    """Nima o'zgarishini ko'rsatadi, hech narsa yozmaydi."""
    return await hemis_student_sync.preview(session)


@hemis_router.post(
    "/students/apply",
    response_model=StudentSyncApplyResponse,
    dependencies=[Depends(RateLimiter(times=2, seconds=600))],
)
async def apply_hemis_students(
    data: StudentSyncApplyRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("hemis_admin_sync")),
):
    """Talabalarni yaratadi va yangilaydi.

    Ma'lumot qayta o'qiladi: apply preview'dan keyin ishlaydi va oradagi
    o'zgarishlarni ham hisobga olishi kerak. Ommaviy yaratish uchun
    `allow_bulk_create` shart.

    Prognoz `student_sync_runner` orqali ketadi — u tungi cron bilan bitta
    qulfni bo'lishadi, aks holda ikkalasi bir vaqtda ishlab, bir talabani ikki
    marta yaratardi.
    """
    return await student_sync_runner.run(session, data, triggered_by="api")


# ── Dars jadvali (schedule-list) ─────────────────────────────────────────────


@hemis_router.post(
    "/schedule/sync",
    response_model=ScheduleSyncResponse,
    dependencies=[Depends(RateLimiter(times=2, seconds=600))],
)
async def sync_hemis_schedule(
    data: ScheduleSyncRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("hemis_admin_sync")),
):
    """HEMIS jadvalini to'liq o'qib, `hemis_schedule_lessons` ga yozadi.

    Joriy yil ~191 sahifa, ~4,5 daqiqa. O'tgan yillar (`education_year`)
    17 daqiqagacha cho'ziladi — ularni CLI orqali yuklang, nginx 900 s da
    uzadi. Tungi cron bilan bitta qulf.
    """
    return await hemis_schedule_sync.run(session, data, triggered_by="api")


@hemis_router.get("/schedule", response_model=ScheduleListResponse)
async def list_hemis_schedule(
    data: ScheduleListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("hemis_admin_sync")),
):
    """Jadval — HEMIS identifikatorlari bo'yicha filtr."""
    return await hemis_schedule_repository.list(session, data)


@hemis_router.get("/schedule/filters", response_model=ScheduleFiltersResponse)
async def hemis_schedule_filters(
    data: ScheduleFiltersRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("hemis_admin_sync")),
):
    """Filtr variantlari — jadvalning o'zidan, bizning spravochniklarsiz.

    Fakultet yoki kafedra tanlansa, qolgan ro'yxatlar shunga toraytiriladi."""
    return await hemis_schedule_repository.filters(session, data)


@hemis_router.get("/schedule/my", response_model=MyScheduleResponse)
async def my_hemis_schedule(
    data: MyScheduleRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("user:me")),
):
    """O'z jadvali login bo'yicha: o'qituvchi — `employee_id_number`,
    talaba — `hemis_student_groups` orqali guruhi. Sukut bo'yicha joriy hafta."""
    return await hemis_schedule_repository.my(session, current_user, data)
