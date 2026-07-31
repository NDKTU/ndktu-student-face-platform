import json
import logging

from fastapi import APIRouter, Depends, Header, Request, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired

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


@router.get("/me", response_model=UserMeResponse)
async def get_me(
    authorization: str = Header(...),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("user:me")),
):
    return await auth_service.get_current_user(session=session, token=authorization)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    current_user=Depends(PermissionRequired("user:me")),
):
    # Отзываем сессию на сервере: удаляем jti из Redis → все токены пользователя
    # становятся невалидными (validate_session вернёт 401).
    await auth_service.logout(current_user.id)


@router.put("/me/credentials", response_model=UserCreateResponse)
async def update_my_credentials(
    data: UserChangeCredentialsRequest,
    authorization: str = Header(...),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("user:me")),
):
    current_user = await auth_service.get_current_user(session=session, token=authorization)
    result = await get_user_repository.change_my_credentials(session=session, current_user=current_user, data=data)
    return result


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
