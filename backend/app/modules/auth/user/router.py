import json
import logging

from core.database.db_helper import db_helper
from core.dependencies.current_user import get_current_user_full
from core.dependencies.role_checker import PermissionRequired
from fastapi import APIRouter, Depends, Request, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.user.model import User

from .repository import get_user_repository
from .schemas import (
    RoleCountsResponse,
    UserChangeCredentialsRequest,
    UserCreateRequest,
    UserCreateResponse,
    UserListRequest,
    UserListResponse,
    UserLoginRequest,
    UserLoginResponse,
    UserMeResponse,
    UserRoleAssignRequest,
    UserUpdateRequest,
)
from .service import auth_service

logger = logging.getLogger(__name__)


async def login_rate_limit_identifier(request: Request) -> str:
    """Key the login rate limit by IP + attempted username, so unrelated
    users behind the same NAT/reverse proxy don't share one bucket."""
    body = await request.body()
    try:
        username = str(json.loads(body).get("username", "")).strip().lower()
    except (json.JSONDecodeError, AttributeError):
        username = ""
    forwarded = request.headers.get("X-Forwarded-For")
    ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "unknown")
    return f"{ip}:{username}:{request.scope['path']}"


router = APIRouter(
    tags=["User"],
    prefix="/user",
)


@router.post(
    "/login",
    response_model=UserLoginResponse,
    dependencies=[Depends(RateLimiter(times=10, seconds=60, identifier=login_rate_limit_identifier))],
)
async def login(data: UserLoginRequest, session: AsyncSession = Depends(db_helper.session_getter)):
    return await auth_service.login(session=session, data=data)


@router.get(
    "/me",
    response_model=UserMeResponse,
    dependencies=[Depends(PermissionRequired("user:me"))],
)
async def get_me(current_user: User = Depends(get_current_user_full)):
    return current_user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    current_user=Depends(PermissionRequired("user:me")),
):
    # Отзываем сессию на сервере: удаляем jti из Redis → все токены пользователя
    # становятся невалидными (validate_session вернёт 401).
    await auth_service.logout(current_user.id)


@router.put(
    "/me/credentials",
    response_model=UserCreateResponse,
    dependencies=[Depends(PermissionRequired("user:me"))],
)
async def update_my_credentials(
    data: UserChangeCredentialsRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(get_current_user_full),
):
    return await get_user_repository.change_my_credentials(
        session=session, current_user=current_user, data=data
    )


@router.post(
    "/",
    response_model=UserCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def create_user(
    data: UserCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:user")),
):
    result = await get_user_repository.create_user(session=session, data=data)
    return result


@router.get("/role-counts", response_model=RoleCountsResponse)
async def get_role_counts(
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:role")),
):
    """Число учёток по ролям. Объявлен до /{user_id}: иначе «role-counts»
    попал бы туда как идентификатор и вернул бы 422."""
    return RoleCountsResponse(counts=await get_user_repository.role_counts(session=session))


@router.get("/{user_id}", response_model=UserCreateResponse)
async def get_user(
    user_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:user")),
):
    return await get_user_repository.get_user(session=session, user_id=user_id)


@router.get("/", response_model=UserListResponse)
async def list_users(
    data: UserListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:user")),
):
    return await get_user_repository.list_users(session=session, request=data)


@router.put(
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


@router.delete(
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


@router.post(
    "/assign_role",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def assign_role(
    data: UserRoleAssignRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:user")),
):
    await get_user_repository.assign_roles(session=session, data=data)
    return {"message": "Roles assigned successfully"}
