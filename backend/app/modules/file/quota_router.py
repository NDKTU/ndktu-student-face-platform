from core.config import settings
from core.database.db_helper import db_helper
from core.dependencies.role_checker import FileLibraryExceptStudent, PermissionRequired
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import User
from app.modules.file import quota
from app.modules.file.schemas import (
    QuotaDefaultResponse,
    QuotaLimitUpdateRequest,
    QuotaResponse,
    TeacherQuotaItem,
    TeacherQuotaListRequest,
    TeacherQuotaListResponse,
    TeacherQuotaUpdateRequest,
)
from app.modules.file.storage import DOCUMENT_MAX_BYTES, IMAGE_MAX_BYTES

# `modules/router.py` da fayl routeridan OLDIN ulanadi: aks holda
# `GET /file/quota` `GET /file/{file_id}` ga tushib, "quota" ni son deb
# o'qishga urinadi.
router = APIRouter(prefix="/file/quota", tags=["File quota"])


def _quota_response(state: quota.QuotaState) -> QuotaResponse:
    return QuotaResponse(
        limit_bytes=state.limit_bytes,
        used_bytes=state.used_bytes,
        remaining_bytes=state.remaining_bytes,
        file_count=state.file_count,
        is_custom=state.is_custom,
        is_unlimited=state.limit_bytes is None,
        max_document_bytes=DOCUMENT_MAX_BYTES,
        max_image_bytes=IMAGE_MAX_BYTES,
    )


async def _default_response(session: AsyncSession) -> QuotaDefaultResponse:
    return QuotaDefaultResponse(
        limit_bytes=await quota.default_limit(session),
        min_limit_bytes=quota.MIN_LIMIT_BYTES,
        max_limit_bytes=settings.file_quota.max_bytes,
    )


@router.get("", response_model=QuotaResponse)
async def my_quota(
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(FileLibraryExceptStudent("read:file")),
):
    """Joriy foydalanuvchining limiti: belgilangan, ishlatilgan, qolgan."""
    state = await quota.get_state(session, user.id)
    return _quota_response(state)


# ─── Admin ────────────────────────────────────────────────────────────


@router.get("/default", response_model=QuotaDefaultResponse)
async def get_default_limit(
    session: AsyncSession = Depends(db_helper.session_getter),
    _: User = Depends(PermissionRequired("read:file_quota")),
):
    return await _default_response(session)


@router.put("/default", response_model=QuotaDefaultResponse)
async def update_default_limit(
    data: QuotaLimitUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("update:file_quota")),
):
    """Umumiy limit — individual limiti yo'q barcha o'qituvchilarga."""
    await quota.set_default_limit(session, data.limit_bytes, user.id)
    return await _default_response(session)


@router.get("/teachers", response_model=TeacherQuotaListResponse)
async def list_teacher_quotas(
    request: TeacherQuotaListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: User = Depends(PermissionRequired("read:file_quota")),
):
    rows, total, default = await quota.list_teachers(
        session,
        search=request.search,
        kafedra_id=request.kafedra_id,
        sort=request.sort,
        page=request.page,
        size=request.size,
    )
    items = []
    for row in rows:
        state = row.state
        over = 0 if state.limit_bytes is None else max(0, state.used_bytes - state.limit_bytes)
        items.append(
            TeacherQuotaItem(
                user_id=row.user_id,
                full_name=row.full_name,
                kafedra_name=row.kafedra_name,
                custom_limit_bytes=row.custom_limit_bytes,
                limit_bytes=state.limit_bytes,
                used_bytes=state.used_bytes,
                remaining_bytes=state.remaining_bytes,
                over_limit_bytes=over,
                file_count=state.file_count,
                is_custom=state.is_custom,
                is_unlimited=state.limit_bytes is None,
            )
        )
    return TeacherQuotaListResponse(
        items=items, total=total, page=request.page, size=request.size, default_limit_bytes=default
    )


@router.put("/teachers/{user_id}", response_model=QuotaResponse)
async def update_teacher_quota(
    user_id: int,
    data: TeacherQuotaUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    user: User = Depends(PermissionRequired("update:file_quota")),
):
    """Individual limit. ``limit_bytes: null`` — umumiy limitga qaytarish."""
    await quota.set_user_limit(session, user_id, data.limit_bytes, user.id)
    state = await quota.get_state(session, user_id)
    return _quota_response(state)
