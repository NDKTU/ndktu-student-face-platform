from __future__ import annotations

import logging

from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired, PsychologyStaffOnly, is_student_only
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import User

from . import stats
from .schemas import (
    BREAKDOWN_BY,
    TIMELINE_PERIOD,
    MethodBreakdownResponse,
    MethodCreateRequest,
    MethodListRequest,
    MethodListResponse,
    MethodResponse,
    MethodStatsResponse,
    MethodUpdateRequest,
    QuestionCreateRequest,
    QuestionResponse,
    QuestionUpdateRequest,
    ResultFilterOptionsResponse,
    RiskListResponse,
    StatsFilter,
    StatsOverviewResponse,
    TestResultListRequest,
    TestResultListResponse,
    TestResultResponse,
    TestSubmitRequest,
    TimelineResponse,
    UserHistoryResponse,
)
from .service import get_psychology_service

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/psychology",
    tags=["Psychology"],
)

# ─── Method endpoints ────────────────────────────────────────────────────────


@router.post(
    "/method/",
    response_model=MethodResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def create_method(
    data: MethodCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:psychology")),
):
    return await get_psychology_service.create_method(session=session, data=data)


@router.get("/method/", response_model=MethodListResponse)
async def list_methods(
    request: MethodListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:psychology")),
):
    return await get_psychology_service.list_methods(session=session, request=request)


@router.get("/method/{method_id}", response_model=MethodResponse)
async def get_method(
    method_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:psychology")),
):
    return await get_psychology_service.get_method(session=session, method_id=method_id)


@router.put(
    "/method/{method_id}",
    response_model=MethodResponse,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def update_method(
    method_id: int,
    data: MethodUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:psychology")),
):
    return await get_psychology_service.update_method(session=session, method_id=method_id, data=data)


@router.delete(
    "/method/{method_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def delete_method(
    method_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:psychology")),
):
    await get_psychology_service.delete_method(session=session, method_id=method_id)


# ─── Question endpoints ───────────────────────────────────────────────────────


@router.post(
    "/question/",
    response_model=QuestionResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def create_question(
    data: QuestionCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:psychology")),
):
    return await get_psychology_service.create_question(session=session, data=data)


@router.get("/question/{question_id}", response_model=QuestionResponse)
async def get_question(
    question_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:psychology")),
):
    return await get_psychology_service.get_question(session=session, question_id=question_id)


@router.put(
    "/question/{question_id}",
    response_model=QuestionResponse,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def update_question(
    question_id: int,
    data: QuestionUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:psychology")),
):
    return await get_psychology_service.update_question(session=session, question_id=question_id, data=data)


@router.delete(
    "/question/{question_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def delete_question(
    question_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:psychology")),
):
    await get_psychology_service.delete_question(session=session, question_id=question_id)


# ─── Test / Result endpoints ──────────────────────────────────────────────────


@router.post(
    "/test/{method_id}/submit",
    response_model=TestResultResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def submit_test(
    method_id: int,
    data: TestSubmitRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("read:psychology")),
):
    return await get_psychology_service.submit_test(
        session=session, method_id=method_id, user_id=current_user.id, data=data
    )


async def _visible_result(session: AsyncSession, result_id: int, user: User):
    """Natija — talabaga faqat oʻziniki. Begonasi 404: borligi ham bilinmasin."""
    result = await get_psychology_service.get_result(session=session, result_id=result_id)
    if is_student_only(user) and result.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Result not found")
    return result


@router.get("/test/results/", response_model=TestResultListResponse)
async def list_results(
    request: TestResultListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("read:psychology_results")),
):
    # Talaba faqat oʻz natijalarini koʻradi — `user_id` parametri bilan ham
    # boshqasinikini soʻray olmaydi. Maʼmuriyat va psixolog — hammasini.
    if is_student_only(current_user):
        request.user_id = current_user.id
    return await get_psychology_service.list_results(session=session, request=request, user_id=None)


@router.get("/test/results/filter-options", response_model=ResultFilterOptionsResponse)
async def result_filter_options(
    session: AsyncSession = Depends(db_helper.session_getter),
    _: User = Depends(PsychologyStaffOnly("read:psychology_results")),
):
    """Natijalar filtri uchun fakultet va guruhlar. `/{result_id}` dan oldin turadi."""
    return await get_psychology_service.result_filter_options(session=session)


@router.delete(
    "/test/results/{result_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def delete_result(
    result_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("delete:psychology_results")),
):
    await _visible_result(session, result_id, current_user)
    await get_psychology_service.delete_result(session=session, result_id=result_id)


@router.get("/test/results/{result_id}", response_model=TestResultResponse)
async def get_result(
    result_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("read:psychology_results")),
):
    return await _visible_result(session, result_id, current_user)


# ─── Statistics ──────────────────────────────────────────────────────────────
# Natijalar ro'yxati bilan bir xil ruxsat: statistika o'sha ma'lumotning yig'indisi.
# Talabaga yopiq: u faqat o'z natijalarini ko'radi, statistikada esa butun
# universitet — xavf guruhidagi talabalarning ismlari bilan.

_read_results = PsychologyStaffOnly("read:psychology_results")


@router.get("/stats/overview", response_model=StatsOverviewResponse)
async def stats_overview(
    f: StatsFilter = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: User = Depends(_read_results),
):
    return await stats.overview(session=session, f=f)


@router.get("/stats/timeline", response_model=TimelineResponse)
async def stats_timeline(
    f: StatsFilter = Depends(),
    method_id: int | None = None,
    period: TIMELINE_PERIOD = "day",
    session: AsyncSession = Depends(db_helper.session_getter),
    _: User = Depends(_read_results),
):
    return await stats.timeline(session=session, f=f, method_id=method_id, period=period)


@router.get("/stats/methods/{method_id}", response_model=MethodStatsResponse)
async def stats_method(
    method_id: int,
    f: StatsFilter = Depends(),
    latest_only: bool = True,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: User = Depends(_read_results),
):
    return await stats.method_stats(session=session, method_id=method_id, f=f, latest_only=latest_only)


@router.get("/stats/methods/{method_id}/breakdown", response_model=MethodBreakdownResponse)
async def stats_method_breakdown(
    method_id: int,
    f: StatsFilter = Depends(),
    by: BREAKDOWN_BY = "faculty",
    category: str | None = None,
    latest_only: bool = True,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: User = Depends(_read_results),
):
    return await stats.method_breakdown(
        session=session, method_id=method_id, by=by, category=category, f=f, latest_only=latest_only
    )


@router.get("/stats/methods/{method_id}/risk", response_model=RiskListResponse)
async def stats_method_risk(
    method_id: int,
    f: StatsFilter = Depends(),
    labels: list[str] | None = Query(default=None),
    category: str | None = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=5000),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: User = Depends(_read_results),
):
    return await stats.risk_students(
        session=session, method_id=method_id, f=f, labels=labels, category=category, page=page, limit=limit
    )


@router.get("/stats/users/{user_id}/history", response_model=UserHistoryResponse)
async def stats_user_history(
    user_id: int,
    method_id: int | None = None,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: User = Depends(_read_results),
):
    return await stats.user_history(session=session, user_id=user_id, method_id=method_id)
