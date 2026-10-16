"""Foydalanuvchilar: kirish, profil, CRUD, rollar va ma'lumot doirasi.

`auth/router.py` dan ajratilgan — u endi faqat bo'limlarni ulaydi.
"""

import logging

from app.core.database.db_helper import db_helper
from app.core.dependencies.role_checker import PermissionRequired
from app.modules.audit import service as audit_service
from app.modules.audit.model import AuditEvent
from fastapi import APIRouter, Depends, File, Header, Request, UploadFile, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import User

from app.modules.auth.user.repository import get_user_repository
from app.modules.auth.user.schemas import (
    UserChangeCredentialsRequest,
    UserCreateRequest,
    UserCreateResponse,
    UserDataScopeResponse,
    UserDataScopeUpdateRequest,
    UserListRequest,
    UserListResponse,
    UserLoginRequest,
    UserLoginResponse,
    UserMeResponse,
    UserRoleAssignRequest,
    UserUpdateRequest,
)
from app.modules.auth.user.service import auth_service
from app.modules.auth.login_limit import login_rate_limit_identifier

logger = logging.getLogger(__name__)


# ============================================================================
#  USER
# ============================================================================
user_router = APIRouter(
    tags=["User"],
    prefix="/user",
)


@user_router.post(
    "/login",
    response_model=UserLoginResponse,
    dependencies=[Depends(RateLimiter(times=10, seconds=60, identifier=login_rate_limit_identifier))],
)
async def login(
    data: UserLoginRequest,
    request: Request,
    session: AsyncSession = Depends(db_helper.session_getter),
):
    # Kirish urinishi muvaffaqiyatli ham, muvaffaqiyatsiz ham qayd etiladi:
    # ikkinchisisiz parol tanlash urinishlari ko'rinmay qolardi. Yozuv
    # alohida tranzaksiyada — xato bo'lsa chaqiruvchining tranzaksiyasi
    # qaytadi, urinish esa qolishi kerak.
    try:
        result = await auth_service.login(session=session, data=data)
    except Exception as exc:
        await audit_service.record_standalone(
            event=AuditEvent.LOGIN_FAILED,
            username=data.username,
            summary=f"Kirish muvaffaqiyatsiz: {data.username}",
            meta={"reason": getattr(exc, "detail", None) or type(exc).__name__},
            request=request,
        )
        raise

    user = await auth_service.get_user_by_username(session, data.username)
    await audit_service.record_standalone(
        event=AuditEvent.LOGIN,
        user_id=user.id if user else None,
        username=data.username,
        summary=f"Tizimga kirdi: {data.username}",
        meta={"method": "local"},
        request=request,
    )
    return result


@user_router.get("/me", response_model=UserMeResponse)
async def get_me(
    authorization: str = Header(...),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("user:me")),
):
    return await auth_service.get_current_user(session=session, token=authorization)


@user_router.post(
    "/me/avatar",
    response_model=UserCreateResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def upload_my_avatar(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("user:me")),
):
    """Profil surati. Yuz nazoratida etalon sifatida birinchi shu ishlatiladi."""
    return await get_user_repository.set_avatar(session=session, user_id=current_user.id, file=file)


@user_router.delete("/me/avatar", response_model=UserCreateResponse)
async def delete_my_avatar(
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("user:me")),
):
    return await get_user_repository.set_avatar(session=session, user_id=current_user.id, file=None)


@user_router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    current_user=Depends(PermissionRequired("user:me")),
):
    # Отзываем сессию на сервере: удаляем jti из Redis → все токены пользователя
    # становятся невалидными (validate_session вернёт 401).
    await auth_service.logout(current_user.id)
    await audit_service.record_standalone(
        event=AuditEvent.LOGOUT,
        user_id=current_user.id,
        username=current_user.username,
        summary=f"Tizimdan chiqdi: {current_user.username}",
        request=request,
    )


@user_router.put("/me/credentials", response_model=UserCreateResponse)
async def update_my_credentials(
    data: UserChangeCredentialsRequest,
    authorization: str = Header(...),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("user:me")),
):
    current_user = await auth_service.get_current_user(session=session, token=authorization)
    result = await get_user_repository.change_my_credentials(session=session, current_user=current_user, data=data)
    return result


@user_router.post(
    "/",
    response_model=UserCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def create_user(
    data: UserCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
):
    result = await get_user_repository.create_user(session=session, data=data)
    return result


@user_router.get("/{user_id}", response_model=UserCreateResponse)
async def get_user(
    user_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:user")),
):
    return await get_user_repository.get_user(session=session, user_id=user_id)


@user_router.get("/", response_model=UserListResponse)
async def list_users(
    data: UserListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:user")),
):
    return await get_user_repository.list_users(session=session, request=data)


@user_router.put(
    "/{user_id}",
    response_model=UserCreateResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def update_user(
    user_id: int,
    data: UserUpdateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:user")),
):
    result = await get_user_repository.update_user(session=session, user_id=user_id, data=data)
    return result


@user_router.delete(
    "/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def delete_user(
    user_id: int,
    force: bool = False,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:user")),
):
    await get_user_repository.delete_user(session=session, user_id=user_id, force=force)


@user_router.post(
    "/assign_role",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def assign_role(
    data: UserRoleAssignRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:user")),  # Assuming admin permission needed
):
    await get_user_repository.assign_roles(session=session, data=data)
    return {"message": "Roles assigned successfully"}


@user_router.get("/{user_id}/data-scope", response_model=UserDataScopeResponse)
async def get_user_data_scope(
    user_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:user")),
):
    """Foydalanuvchining ko'rish doirasi: biriktirilgan fakultet, kafedra va guruhlar.

    Doira turi rolda (`roles.data_scope`), bu yerda esa aynan qaysilari
    (`modules/auth/data_scope.py`).
    """
    return await get_user_repository.get_data_scope(session=session, user_id=user_id)


@user_router.put(
    "/{user_id}/data-scope",
    response_model=UserDataScopeResponse,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def set_user_data_scope(
    user_id: int,
    data: UserDataScopeUpdateRequest,
    request: Request,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("update:user")),
):
    result = await get_user_repository.set_data_scope(session=session, user_id=user_id, data=data)
    await audit_service.record_standalone(
        event=AuditEvent.DATA_SCOPE_CHANGED,
        user_id=current_user.id,
        username=current_user.username,
        object_type="user",
        object_id=user_id,
        summary=(
            f"Ko'rish doirasi o'zgartirildi (foydalanuvchi #{user_id}): "
            f"{len(result.faculties)} fakultet, {len(result.kafedras)} kafedra, {len(result.groups)} guruh"
        ),
        request=request,
    )
    return result
