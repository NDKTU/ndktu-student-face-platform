"""Audit yozuvlarini o'qish."""

from datetime import datetime, time, timedelta

from sqlalchemy import Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.model import AuditEvent, AuditLog
from app.modules.auth.model import Student, Teacher, User

from .schemas import AuditEventOption, AuditListRequest, AuditListResponse, AuditLogResponse

#: Kirish-chiqishga oid hodisalar — «faqat kirishlar» filtri uchun.
AUTH_EVENTS = (
    AuditEvent.LOGIN,
    AuditEvent.LOGIN_FAILED,
    AuditEvent.LOGOUT,
    AuditEvent.SESSION_EVICTED,
)


def _apply_filters(stmt: Select, request: AuditListRequest) -> Select:
    if request.user_id:
        stmt = stmt.where(AuditLog.user_id == request.user_id)
    if request.event:
        stmt = stmt.where(AuditLog.event == request.event)
    if request.only_auth:
        stmt = stmt.where(AuditLog.event.in_(AUTH_EVENTS))
    if request.date_from:
        stmt = stmt.where(AuditLog.created_at >= datetime.combine(request.date_from, time.min))
    if request.date_to:
        # Kunning oxirigacha: `<= sana` bo'lsa, o'sha kunning yozuvlari
        # tushib qolardi (vaqt 00:00 dan katta).
        stmt = stmt.where(AuditLog.created_at < datetime.combine(request.date_to + timedelta(days=1), time.min))
    if request.search and request.search.strip():
        pattern = f"%{request.search.strip()}%"
        # Ism `students`/`teachers` da, login esa yozuvning o'zida.
        stmt = stmt.where(
            or_(
                AuditLog.username.ilike(pattern),
                AuditLog.summary.ilike(pattern),
                AuditLog.ip.ilike(pattern),
                select(Student.id)
                .where(Student.user_id == AuditLog.user_id, Student.full_name.ilike(pattern))
                .exists(),
                select(Teacher.id)
                .where(Teacher.user_id == AuditLog.user_id, Teacher.full_name.ilike(pattern))
                .exists(),
            )
        )
    return stmt


async def list_logs(session: AsyncSession, request: AuditListRequest) -> AuditListResponse:
    total = (
        await session.execute(_apply_filters(select(func.count()).select_from(AuditLog), request))
    ).scalar() or 0

    # Ism ikkita jadvalda bo'lishi mumkin (talaba yoki xodim) — qaysi biri
    # topilsa, o'shanisi olinadi.
    student_name = select(Student.full_name).where(Student.user_id == AuditLog.user_id).scalar_subquery()
    teacher_name = select(Teacher.full_name).where(Teacher.user_id == AuditLog.user_id).scalar_subquery()

    stmt = _apply_filters(
        select(AuditLog, func.coalesce(student_name, teacher_name).label("full_name")), request
    )
    rows = (
        await session.execute(
            stmt.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .offset(request.offset)
            .limit(request.limit)
        )
    ).all()

    logs = []
    for log, full_name in rows:
        item = AuditLogResponse.model_validate(log)
        item.full_name = full_name
        logs.append(item)

    return AuditListResponse(total=total, page=request.page, limit=request.limit, logs=logs)


async def list_event_options(session: AsyncSession) -> list[AuditEventOption]:
    """Filtr uchun: bazada haqiqatan uchraydigan hodisalar.

    Ro'yxat kod emas, ma'lumot bo'yicha tuziladi — hali hech qachon
    yozilmagan hodisani filtrda ko'rsatish chalg'itadi.
    """
    rows = (
        await session.execute(
            select(AuditLog.event, func.count())
            .group_by(AuditLog.event)
            .order_by(func.count().desc())
        )
    ).all()
    return [AuditEventOption(value=event, count=count) for event, count in rows]


async def purge_older_than(session: AsyncSession, *, days: int) -> int:
    """Muddati o'tgan yozuvlarni o'chiradi.

    `DELETE` ni SQL bilan qilamiz: ORM orqali million qatorni o'chirish
    ularni xotiraga yuklardi.
    """
    from sqlalchemy import delete

    cutoff = datetime.now() - timedelta(days=days)
    result = await session.execute(delete(AuditLog).where(AuditLog.created_at < cutoff))
    await session.commit()
    return result.rowcount or 0
