"""Эндпоинты синхронизации с EduPlan.

Наружу торчат только чтение статуса, предпросмотр и применение. Записи в
EduPlan нет ни одной: интеграция односторонняя.
"""

import logging

from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired, get_current_user_id
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.user.schemas import UserLoginRequest, UserLoginResponse

from . import credentials
from .auth_service import eduplan_auth_service
from .client import EduPlanClient
from .schemas import (
    ApplyRequest,
    ApplyResponse,
    EduPlanSettingsIn,
    EduPlanSettingsOut,
    PreviewResponse,
)
from .service import eduplan_sync_service
from .sync_runner import eduplan_sync_runner
from .workload_service import eduplan_workload_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/eduplan", tags=["EduPlan"])


@router.get("/status")
async def eduplan_status(
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:eduplan")),
):
    """Состояние интеграции: настроена ли и отвечает ли EduPlan.

    Отдельная ручка нужна, чтобы отличать «не заполнены креды» от «сервис
    недоступен» до запуска долгого предпросмотра. Креды берутся из базы
    (введены в интерфейсе), а если их там нет — из окружения.
    """
    cfg = await credentials.effective_config(session)
    row = await credentials.load_row(session)
    source = "db" if row is not None else "env"
    if not cfg.is_configured:
        if row is not None and not cfg.password:
            detail = "Saqlangan parol o‘qilmadi (server kaliti o‘zgargan) — parolni qaytadan kiriting"
        elif not cfg.enabled:
            detail = (
                "Integratsiya o‘chirilgan: quyidagi formada login va parolni kiriting "
                "yoki APP_CONFIG__EDUPLAN__ENABLED=true qiling"
            )
        elif not cfg.base_url:
            detail = "EduPlan manzili (base_url) ko‘rsatilmagan"
        else:
            missing = [name for name, value in (("login", cfg.username), ("parol", cfg.password)) if not value]
            detail = f"Servis akkaunti ma’lumotlari to‘liq emas: {', '.join(missing)} kiritilmagan"
        return {
            "configured": False,
            "reachable": False,
            "base_url": cfg.base_url,
            "source": source,
            "detail": detail,
        }

    try:
        async with EduPlanClient(cfg) as client:
            years = await client.academic_years()
        active = next((y for y in years if y.get("is_active")), None)
        return {
            "configured": True,
            "reachable": True,
            "base_url": cfg.base_url,
            "source": source,
            "active_academic_year": active,
        }
    except Exception as e:  # noqa: BLE001 — статус не должен падать пятисоткой
        return {
            "configured": True,
            "reachable": False,
            "base_url": cfg.base_url,
            "source": source,
            "detail": str(getattr(e, "detail", e)),
        }


@router.get("/settings", response_model=EduPlanSettingsOut)
async def eduplan_settings_get(
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:eduplan")),
):
    """Текущие учётные данные без пароля: показывается только факт его наличия."""
    return await credentials.masked_settings(session)


@router.put("/settings", response_model=EduPlanSettingsOut)
async def eduplan_settings_put(
    payload: EduPlanSettingsIn,
    session: AsyncSession = Depends(db_helper.session_getter),
    user_id: int = Depends(get_current_user_id),
    _: PermissionRequired = Depends(PermissionRequired("sync:eduplan")),
):
    """Сохранить логин/пароль сервисного аккаунта из интерфейса.

    Пароль EduPlan меняется часто; править ради этого ``.env`` на сервере и
    перезапускать backend — плохой процесс. Пустой пароль в форме означает
    «оставить прежний».
    """
    try:
        await credentials.upsert(session, payload, user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)) from e
    return await credentials.masked_settings(session)


@router.delete("/settings", status_code=status.HTTP_204_NO_CONTENT)
async def eduplan_settings_delete(
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("sync:eduplan")),
):
    """Удалить сохранённые в базе креды — клиент вернётся к переменным окружения."""
    await credentials.clear(session)
    return None


@router.post(
    "/preview",
    response_model=PreviewResponse,
    dependencies=[Depends(RateLimiter(times=3, seconds=60))],
)
async def eduplan_preview(
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("sync:eduplan")),
):
    """Сходить в EduPlan и показать, что изменится. Ничего не пишет."""
    return await eduplan_sync_service.build_preview(session)


@router.post(
    "/apply",
    response_model=ApplyResponse,
    dependencies=[Depends(RateLimiter(times=3, seconds=60))],
)
async def eduplan_apply(
    data: ApplyRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("sync:eduplan")),
):
    """Применить разобранный администратором предпросмотр."""
    return await eduplan_sync_service.apply(session, data)


@router.post(
    "/workloads",
    dependencies=[Depends(RateLimiter(times=3, seconds=60))],
)
async def eduplan_sync_workloads(
    academic_year_id: int | None = None,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("sync:eduplan")),
):
    """Импортировать нагрузку в связки преподаватель-предмет-группа.

    Требует, чтобы преподаватели, предметы и группы уже были связаны с EduPlan:
    нагрузка ссылается на них по external_id.
    """
    return await eduplan_workload_service.sync(session, academic_year_id)


@router.post(
    "/run",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(RateLimiter(times=2, seconds=60))],
)
async def eduplan_run_full_sync(
    _: PermissionRequired = Depends(PermissionRequired("sync:eduplan")),
):
    """Прогон запускается в фоне, ответ возвращается сразу.

    Прогон идёт минутами, а браузер обрывает запрос через 10 секунд (axios) —
    раньше это выглядело как «timeout of 10000ms exceeded», хотя сервер
    продолжал работать. Теперь клиент получает состояние и опрашивает
    ``/run/status``.

    Применяет только однозначные предложения: конфликты и деактивации
    остаются администратору. Та же точка входа, что и у ночного расписания.
    """
    return await eduplan_sync_runner.launch(triggered_by="manual")


@router.get("/run/status")
async def eduplan_run_status(
    _: PermissionRequired = Depends(PermissionRequired("read:eduplan")),
):
    """Последний прогон: идёт, завершён или упал.

    ``null`` означает, что прогонов ещё не было (или прошли сутки — состояние
    живёт столько же).
    """
    return await eduplan_sync_runner.read_state()


@router.post(
    "/login",
    response_model=UserLoginResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def eduplan_login(
    data: UserLoginRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
):
    """EduPlan hisob qaydnomasi orqali kirish."""
    access_token = await eduplan_auth_service.login(
        session=session,
        username=data.username,
        password=data.password,
    )
    return UserLoginResponse(type="Bearer", access_token=access_token)
