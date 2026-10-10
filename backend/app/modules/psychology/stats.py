"""Psixologik testlar statistikasi.

Hamma hisob ikki manbaga tayanadi: `PsychologyResult.diagnosis` (topshirilgan
paytda hisoblangan daraja/ball) va metodning HOZIRGI `instruction`i (darajalar
tartibi va qaysi daraja «xavf guruhi» ekani — `interpretation[].risk`). Xavf
belgisi natijaga yozilmaydi: psixolog uni keyin qo'yishi mumkin va u eski
natijalarga ham tatbiq bo'lishi kerak.

`latest_only` — har bir talabaning har bir metod bo'yicha faqat oxirgi natijasi.
Testni qayta topshirgan talaba taqsimotda ikki marta sanalmasligi uchun
taqsimot, kesimlar va xavf ro'yxati sukut bo'yicha shu rejimda ishlaydi.
Egasi o'chirilgan natijalar (`user_id IS NULL`) bu rejimda tushib qoladi —
ular kimga tegishli ekanini bilmay turib «oxirgisi»ni tanlab bo'lmaydi.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import Select, distinct, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.mixins.time_stamp_mixin import utcnow_naive
from app.modules.auth.model import Student, User
from app.modules.organization_structure.model import Faculty, Group
from app.modules.psychology.model import PsychologyMethod, PsychologyResult

from .schemas import (
    BreakdownRow,
    CategoryStats,
    FacultyCoverage,
    HistoryCategory,
    HistoryItem,
    LevelCount,
    MethodBreakdownResponse,
    MethodStatsResponse,
    MethodUsage,
    RiskListResponse,
    RiskStudent,
    ScoreCount,
    StatsFilter,
    StatsOverviewResponse,
    TimelinePoint,
    TimelineResponse,
    UserHistoryResponse,
)

# Baza sanalarni naive UTC'da saqlaydi, foydalanuvchi esa Toshkent sanasi bilan ishlaydi.
TASHKENT_OFFSET = timedelta(hours=5)

# Standart oynalar: filtr sanasi berilmagan dinamika uchun.
TIMELINE_DEFAULT_SPAN = {"day": 89, "week": 7 * 25, "month": 31 * 11}


# ─── Umumiy yordamchilar ─────────────────────────────────────────────────────


@dataclass(frozen=True)
class _Row:
    result_id: int
    method_id: int
    user_id: int | None
    diagnosis: dict[str, Any] | None
    created_at: datetime
    username: str | None
    full_name: str | None
    student_id_number: str | None
    group_id: int | None
    group_name: str | None
    course: int | None
    faculty_id: int | None
    faculty_name: str | None


def _pct(part: int, whole: int) -> float:
    return round(100 * part / whole, 1) if whole else 0.0


def _avg(values: list[int]) -> float | None:
    return round(sum(values) / len(values), 2) if values else None


def _as_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _utc_bounds(f: StatsFilter) -> tuple[datetime | None, datetime | None]:
    """Toshkent sanalari oralig'ini naive-UTC yarim ochiq oraliqqa aylantiradi."""
    start = datetime.combine(f.date_from, time.min) - TASHKENT_OFFSET if f.date_from else None
    end = datetime.combine(f.date_to + timedelta(days=1), time.min) - TASHKENT_OFFSET if f.date_to else None
    return start, end


def _today_local() -> date:
    return (utcnow_naive() + TASHKENT_OFFSET).date()


def _apply_dates(stmt: Select, f: StatsFilter) -> Select:
    start, end = _utc_bounds(f)
    if start is not None:
        stmt = stmt.where(PsychologyResult.created_at >= start)
    if end is not None:
        stmt = stmt.where(PsychologyResult.created_at < end)
    return stmt


def _apply_org(stmt: Select, f: StatsFilter) -> Select:
    if f.faculty_id:
        stmt = stmt.where(Group.faculty_id == f.faculty_id)
    if f.group_id:
        stmt = stmt.where(Group.id == f.group_id)
    if f.course:
        stmt = stmt.where(Group.course == f.course)
    if f.scope_group_ids is not None:
        stmt = stmt.where(Group.id.in_(f.scope_group_ids))
    return stmt


def _has_org(f: StatsFilter) -> bool:
    # Doira ham guruh orqali ishlaydi — u bor bo'lsa, Group birlashtirilishi shart.
    return bool(f.faculty_id or f.group_id or f.course or f.scope_group_ids is not None)


def _latest_ids(f: StatsFilter, method_id: int | None) -> Select:
    """Har bir (talaba, metod) juftligi uchun davr ichidagi oxirgi natija id'si."""
    stmt = (
        select(PsychologyResult.id)
        .where(PsychologyResult.user_id.is_not(None))
        .distinct(PsychologyResult.user_id, PsychologyResult.method_id)
        .order_by(
            PsychologyResult.user_id,
            PsychologyResult.method_id,
            PsychologyResult.created_at.desc(),
            PsychologyResult.id.desc(),
        )
    )
    if method_id is not None:
        stmt = stmt.where(PsychologyResult.method_id == method_id)
    return _apply_dates(stmt, f)


async def _fetch_rows(
    session: AsyncSession,
    f: StatsFilter,
    method_id: int | None,
    latest_only: bool,
) -> list[_Row]:
    stmt = (
        select(
            PsychologyResult.id,
            PsychologyResult.method_id,
            PsychologyResult.user_id,
            PsychologyResult.diagnosis,
            PsychologyResult.created_at,
            User.username,
            Student.full_name,
            Student.student_id_number,
            Group.id,
            Group.name,
            Group.course,
            Faculty.id,
            Faculty.name,
        )
        .select_from(PsychologyResult)
        .outerjoin(User, User.id == PsychologyResult.user_id)
        .outerjoin(Student, Student.user_id == PsychologyResult.user_id)
        .outerjoin(Group, Group.id == Student.group_id)
        .outerjoin(Faculty, Faculty.id == Group.faculty_id)
        .order_by(PsychologyResult.created_at.desc(), PsychologyResult.id.desc())
    )
    if method_id is not None:
        stmt = stmt.where(PsychologyResult.method_id == method_id)
    stmt = _apply_org(_apply_dates(stmt, f), f)
    if latest_only:
        stmt = stmt.where(PsychologyResult.id.in_(_latest_ids(f, method_id)))

    rows: list[_Row] = []
    seen: set[int] = set()
    for r in (await session.execute(stmt)).all():
        # Bitta foydalanuvchiga ikkita talaba yozuvi bog'langan bo'lsa natija
        # ikki marta keladi — birinchisini olamiz.
        if r[0] in seen:
            continue
        seen.add(r[0])
        rows.append(_Row(*r))
    return rows


async def _get_method(session: AsyncSession, method_id: int) -> PsychologyMethod:
    method = await session.get(PsychologyMethod, method_id)
    if not method:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Psychology method not found")
    return method


# ─── Metod ko'rsatmasi (instruction) ─────────────────────────────────────────


def _scoring(method: PsychologyMethod) -> str | None:
    return ((method.instruction or {}).get("scoring") or {}).get("method")


def _category_names(method: PsychologyMethod) -> list[str]:
    instr = method.instruction or {}
    names = list(((instr.get("scoring") or {}).get("categories") or {}).keys())
    for name in (instr.get("category_interpretations") or {}).keys():
        if name not in names:
            names.append(name)
    return names


def _interp_items(method: PsychologyMethod, category: str | None) -> list[dict[str, Any]]:
    instr = method.instruction or {}
    if category is None:
        items = instr.get("interpretation") or []
    else:
        items = (instr.get("category_interpretations") or {}).get(category) or []
    return [i for i in items if isinstance(i, dict)]


def _ordered_labels(items: list[dict[str, Any]]) -> list[str]:
    """Darajalar ball oralig'i bo'yicha: past → yuqori."""
    ordered = sorted(items, key=lambda i: _as_int(i.get("min")) if _as_int(i.get("min")) is not None else 0)
    labels: list[str] = []
    for item in ordered:
        label = str(item.get("label") or "").strip()
        if label and label not in labels:
            labels.append(label)
    return labels


def _risk_labels(items: list[dict[str, Any]]) -> set[str]:
    return {str(i.get("label") or "").strip() for i in items if i.get("risk")} - {""}


def _level(diagnosis: Any, category: str | None) -> tuple[str | None, int | None]:
    """Natijadan (daraja, ball): `category=None` — sum rejimi."""
    if not isinstance(diagnosis, dict):
        return None, None
    if category is None:
        if diagnosis.get("type") != "sum":
            return None, None
        return (str(diagnosis.get("label") or "").strip() or None), _as_int(diagnosis.get("total"))
    for cat in diagnosis.get("categories") or []:
        if isinstance(cat, dict) and cat.get("name") == category:
            return (str(cat.get("label") or "").strip() or None), _as_int(cat.get("score"))
    return None, None


def _all_labels(ordered: list[str], found: list[str | None]) -> list[str]:
    """Ko'rsatmadagi darajalar + natijalarda uchragan eskilari (ko'rsatma o'zgargan bo'lsa)."""
    extra = sorted({label for label in found if label and label not in ordered})
    return ordered + extra


def _level_counts(found: list[str | None], ordered: list[str], risk: set[str]) -> list[LevelCount]:
    counter = Counter(label for label in found if label)
    total = len(found)
    return [
        LevelCount(label=label, count=counter.get(label, 0), pct=_pct(counter.get(label, 0), total), risk=label in risk)
        for label in _all_labels(ordered, found)
    ]


# ─── 1. Umumiy ko'rinish ─────────────────────────────────────────────────────


async def overview(session: AsyncSession, f: StatsFilter) -> StatsOverviewResponse:
    def scoped(stmt: Select) -> Select:
        if _has_org(f):
            stmt = stmt.join(Student, Student.user_id == PsychologyResult.user_id).join(
                Group, Group.id == Student.group_id
            )
        return _apply_org(stmt, f)

    def count_results() -> Select:
        return scoped(select(func.count(distinct(PsychologyResult.id))).select_from(PsychologyResult))

    total_results = (await session.execute(_apply_dates(count_results(), f))).scalar() or 0

    now = utcnow_naive()
    recent = {}
    for days in (7, 30):
        stmt = count_results().where(PsychologyResult.created_at >= now - timedelta(days=days))
        recent[days] = (await session.execute(stmt)).scalar() or 0

    method_stmt = _apply_dates(
        scoped(
            select(
                PsychologyMethod.id,
                PsychologyMethod.name,
                func.count(distinct(PsychologyResult.id)),
                func.count(distinct(PsychologyResult.user_id)),
            )
            .select_from(PsychologyResult)
            .join(PsychologyMethod, PsychologyMethod.id == PsychologyResult.method_id)
        ),
        f,
    ).group_by(PsychologyMethod.id, PsychologyMethod.name)
    methods = sorted(
        (
            MethodUsage(method_id=mid, name=name, results=results, students=students)
            for mid, name, results, students in (await session.execute(method_stmt)).all()
        ),
        key=lambda m: -m.results,
    )

    # Qamrov maxraji — faol guruhdagi faol foydalanuvchili talabalar.
    def students_base(stmt: Select) -> Select:
        stmt = (
            stmt.join(Group, Group.id == Student.group_id)
            .join(User, User.id == Student.user_id)
            .where(Group.is_active.is_(True), User.is_active.is_(True))
        )
        return _apply_org(stmt, f)

    total_by_faculty = dict(
        (
            await session.execute(
                students_base(select(Group.faculty_id, func.count(distinct(Student.id))).select_from(Student)).group_by(
                    Group.faculty_id
                )
            )
        ).all()
    )
    tested_stmt = students_base(
        select(Group.faculty_id, func.count(distinct(Student.id)))
        .select_from(Student)
        .join(PsychologyResult, PsychologyResult.user_id == Student.user_id)
    ).group_by(Group.faculty_id)
    tested_by_faculty = dict((await session.execute(_apply_dates(tested_stmt, f))).all())

    faculty_names = dict(
        (
            await session.execute(
                select(Faculty.id, Faculty.name).where(Faculty.id.in_(list(total_by_faculty.keys()) or [-1]))
            )
        ).all()
    )
    faculties = sorted(
        (
            FacultyCoverage(
                faculty_id=fid,
                name=faculty_names.get(fid, "—"),
                total_students=total,
                tested_students=tested_by_faculty.get(fid, 0),
                coverage_pct=_pct(tested_by_faculty.get(fid, 0), total),
            )
            for fid, total in total_by_faculty.items()
        ),
        key=lambda c: c.name,
    )

    total_students = sum(total_by_faculty.values())
    tested_students = sum(tested_by_faculty.values())
    return StatsOverviewResponse(
        total_results=total_results,
        results_7d=recent[7],
        results_30d=recent[30],
        total_students=total_students,
        tested_students=tested_students,
        coverage_pct=_pct(tested_students, total_students),
        methods=methods,
        faculties=faculties,
    )


# ─── 2. Metod bo'yicha taqsimot ──────────────────────────────────────────────


async def method_stats(
    session: AsyncSession, method_id: int, f: StatsFilter, latest_only: bool
) -> MethodStatsResponse:
    method = await _get_method(session, method_id)
    rows = await _fetch_rows(session, f, method_id, latest_only)
    scoring = _scoring(method)

    if scoring == "category":
        categories: list[CategoryStats] = []
        for name in _category_names(method):
            pairs = [_level(r.diagnosis, name) for r in rows]
            items = _interp_items(method, name)
            scores = [s for _, s in pairs if s is not None]
            categories.append(
                CategoryStats(
                    name=name,
                    avg=_avg(scores),
                    min=min(scores) if scores else None,
                    max=max(scores) if scores else None,
                    levels=_level_counts([label for label, _ in pairs], _ordered_labels(items), _risk_labels(items)),
                )
            )
        undetermined = sum(
            1 for r in rows if not (isinstance(r.diagnosis, dict) and r.diagnosis.get("type") == "category")
        )
        return MethodStatsResponse(
            method_id=method.id,
            name=method.name,
            scoring=scoring,
            total=len(rows),
            undetermined=undetermined,
            categories=categories,
        )

    pairs = [_level(r.diagnosis, None) for r in rows]
    items = _interp_items(method, None)
    scores = [s for _, s in pairs if s is not None]
    return MethodStatsResponse(
        method_id=method.id,
        name=method.name,
        scoring=scoring,
        total=len(rows),
        undetermined=sum(1 for label, _ in pairs if not label),
        levels=_level_counts([label for label, _ in pairs], _ordered_labels(items), _risk_labels(items)),
        histogram=[ScoreCount(score=s, count=c) for s, c in sorted(Counter(scores).items())],
        avg=_avg(scores),
        min=min(scores) if scores else None,
        max=max(scores) if scores else None,
    )


# ─── 3. Tashkiliy tuzilma kesimi ─────────────────────────────────────────────


def _resolve_category(method: PsychologyMethod, category: str | None) -> str | None:
    if _scoring(method) != "category":
        return None
    names = _category_names(method)
    if category and category in names:
        return category
    return names[0] if names else None


async def method_breakdown(
    session: AsyncSession,
    method_id: int,
    by: str,
    category: str | None,
    f: StatsFilter,
    latest_only: bool,
) -> MethodBreakdownResponse:
    method = await _get_method(session, method_id)
    category = _resolve_category(method, category)
    items = _interp_items(method, category)
    ordered = _ordered_labels(items)
    risk = _risk_labels(items)

    buckets: dict[int, list[tuple[str | None, int | None]]] = defaultdict(list)
    names: dict[int, str] = {}
    for r in await _fetch_rows(session, f, method_id, latest_only):
        if by == "faculty":
            key, name = r.faculty_id, r.faculty_name
        elif by == "course":
            key, name = r.course, f"{r.course}-kurs" if r.course else None
        else:
            key, name = r.group_id, r.group_name
        # Talaba bo'lmagan (xodim) yoki guruhsiz natija kesimga kirmaydi.
        if key is None:
            continue
        names[key] = name or "—"
        buckets[key].append(_level(r.diagnosis, category))

    found: list[str | None] = []
    rows: list[BreakdownRow] = []
    for key, pairs in buckets.items():
        labels = [label for label, _ in pairs]
        found.extend(labels)
        scores = [s for _, s in pairs if s is not None]
        risk_count = sum(1 for label in labels if label in risk)
        rows.append(
            BreakdownRow(
                key=key,
                name=names[key],
                total=len(pairs),
                avg=_avg(scores),
                levels=dict(Counter(label for label in labels if label)),
                risk_count=risk_count,
                risk_pct=_pct(risk_count, len(pairs)),
            )
        )
    rows.sort(key=(lambda row: row.key) if by == "course" else (lambda row: row.name))

    return MethodBreakdownResponse(
        by=by,
        category=category,
        labels=_all_labels(ordered, found),
        risk_labels=[label for label in _all_labels(ordered, found) if label in risk],
        rows=rows,
    )


# ─── 4. Xavf guruhi ──────────────────────────────────────────────────────────


async def risk_students(
    session: AsyncSession,
    method_id: int,
    f: StatsFilter,
    labels: list[str] | None,
    category: str | None,
    page: int,
    limit: int,
) -> RiskListResponse:
    """Oxirgi natijasi xavfli darajaga tushgan talabalar.

    `labels` berilmasa — metod ko'rsatmasida `risk: true` bilan belgilangan
    darajalar. Kategoriya rejimida `category` berilmasa, har bir kategoriya
    alohida tekshiriladi va talaba har bir xavfli kategoriyasi uchun bir qatorda chiqadi.
    """
    method = await _get_method(session, method_id)
    if _scoring(method) == "category":
        categories: list[str | None] = [category] if category else list(_category_names(method))
    else:
        categories = [None]

    explicit = {label.strip() for label in labels or [] if label.strip()}
    risk_by_cat = {c: explicit or _risk_labels(_interp_items(method, c)) for c in categories}

    items: list[RiskStudent] = []
    for r in await _fetch_rows(session, f, method_id, latest_only=True):
        if r.user_id is None:
            continue
        for c in categories:
            label, score = _level(r.diagnosis, c)
            if label and label in risk_by_cat[c]:
                items.append(
                    RiskStudent(
                        result_id=r.result_id,
                        user_id=r.user_id,
                        username=r.username,
                        full_name=r.full_name,
                        student_id_number=r.student_id_number,
                        group_name=r.group_name,
                        faculty_name=r.faculty_name,
                        course=r.course,
                        category=c,
                        label=label,
                        score=score,
                        created_at=r.created_at,
                    )
                )

    used = set().union(*risk_by_cat.values()) if risk_by_cat else set()
    offset = max(0, (page - 1) * limit)
    return RiskListResponse(
        total=len(items),
        risk_labels=sorted(used),
        items=items[offset : offset + limit],
    )


# ─── 5. Dinamika ─────────────────────────────────────────────────────────────


def _bucket_start(d: date, period: str) -> date:
    if period == "week":
        return d - timedelta(days=d.weekday())
    if period == "month":
        return d.replace(day=1)
    return d


def _next_bucket(d: date, period: str) -> date:
    if period == "week":
        return d + timedelta(days=7)
    if period == "month":
        return date(d.year + d.month // 12, d.month % 12 + 1, 1)
    return d + timedelta(days=1)


async def timeline(
    session: AsyncSession, f: StatsFilter, method_id: int | None, period: str
) -> TimelineResponse:
    date_to = f.date_to or _today_local()
    date_from = f.date_from or date_to - timedelta(days=TIMELINE_DEFAULT_SPAN[period])
    window = f.model_copy(update={"date_from": date_from, "date_to": date_to})

    # Литералы, а не bind-параметры: иначе выражение в SELECT и GROUP BY
    # получит разные $n и Postgres не признает их одним и тем же.
    # `period` уже проверен схемой (day/week/month).
    bucket = func.date_trunc(
        literal_column(f"'{period}'"),
        PsychologyResult.created_at + literal_column("interval '5 hours'"),
    )
    stmt = select(bucket, func.count(distinct(PsychologyResult.id))).select_from(PsychologyResult)
    if _has_org(f):
        stmt = stmt.join(Student, Student.user_id == PsychologyResult.user_id).join(
            Group, Group.id == Student.group_id
        )
    if method_id is not None:
        stmt = stmt.where(PsychologyResult.method_id == method_id)
    stmt = _apply_org(_apply_dates(stmt, window), f).group_by(bucket)
    counts = {b.date(): c for b, c in (await session.execute(stmt)).all()}

    points: list[TimelinePoint] = []
    cursor = _bucket_start(date_from, period)
    while cursor <= date_to:
        points.append(TimelinePoint(bucket=cursor, count=counts.get(cursor, 0)))
        cursor = _next_bucket(cursor, period)
    return TimelineResponse(period=period, points=points)


async def user_history(session: AsyncSession, user_id: int, method_id: int | None) -> UserHistoryResponse:
    user = await session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    full_name = (
        await session.execute(select(Student.full_name).where(Student.user_id == user_id).limit(1))
    ).scalar_one_or_none()

    stmt = (
        select(PsychologyResult, PsychologyMethod.name)
        .join(PsychologyMethod, PsychologyMethod.id == PsychologyResult.method_id)
        .where(PsychologyResult.user_id == user_id)
        .order_by(PsychologyResult.created_at, PsychologyResult.id)
    )
    if method_id is not None:
        stmt = stmt.where(PsychologyResult.method_id == method_id)

    items: list[HistoryItem] = []
    for result, method_name in (await session.execute(stmt)).all():
        diag = result.diagnosis if isinstance(result.diagnosis, dict) else {}
        label, score = _level(diag, None)
        items.append(
            HistoryItem(
                result_id=result.id,
                method_id=result.method_id,
                method_name=method_name,
                created_at=result.created_at,
                label=label,
                score=score,
                categories=[
                    HistoryCategory(
                        name=str(c.get("name") or ""),
                        score=_as_int(c.get("score")) or 0,
                        label=str(c.get("label") or ""),
                    )
                    for c in diag.get("categories") or []
                    if isinstance(c, dict)
                ],
            )
        )
    return UserHistoryResponse(user_id=user.id, full_name=full_name, username=user.username, items=items)
