from datetime import date
from typing import Optional

from core.db_helper import db_helper
from dependence.role_checker import PermissionRequired
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ..filters import StatsFilters, stats_filters
from ..repository import get_statistics_repository
from ..schemas import (
    KafedraStatsResponse,
    LeaderboardResponse,
    CourseStatsResponse,
    SubjectStatsResponse,
)

router = APIRouter(prefix="/org", tags=["Statistics — Organizational"])


@router.get("/subject/{subject_id}", response_model=SubjectStatsResponse)
async def subject_stats(
    subject_id: int,
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    faculty_id: Optional[int] = Query(None),
    group_id: Optional[int] = Query(None),
    kafedra_id: Optional[int] = Query(None),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:statistics")),
):
    filters = StatsFilters(
        date_from=date_from,
        date_to=date_to,
        faculty_id=faculty_id,
        group_id=group_id,
        kafedra_id=kafedra_id,
    )
    return await get_statistics_repository.get_subject_stats(session=session, subject_id=subject_id, filters=filters)


@router.get("/kafedra/{kafedra_id}", response_model=KafedraStatsResponse)
async def kafedra_stats(
    kafedra_id: int,
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    faculty_id: Optional[int] = Query(None),
    group_id: Optional[int] = Query(None),
    subject_id: Optional[int] = Query(None),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:statistics")),
):
    filters = StatsFilters(
        date_from=date_from,
        date_to=date_to,
        faculty_id=faculty_id,
        group_id=group_id,
        subject_id=subject_id,
    )
    return await get_statistics_repository.get_kafedra_stats(session=session, kafedra_id=kafedra_id, filters=filters)


@router.get("/course/{course_id}", response_model=CourseStatsResponse)
async def course_stats(
    course_id: int,
    filters: StatsFilters = Depends(stats_filters),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:statistics")),
):
    return await get_statistics_repository.get_course_stats(session=session, course_id=course_id, filters=filters)


@router.get("/leaderboard", response_model=LeaderboardResponse)
async def org_leaderboard(
    level: str = Query(..., pattern="^(faculty|group|subject|teacher)$"),
    limit: int = Query(20, ge=1, le=200),
    filters: StatsFilters = Depends(stats_filters),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:statistics")),
):
    return await get_statistics_repository.get_org_leaderboard(
        session=session, level=level, filters=filters, limit=limit
    )
