import logging

from core.db_helper import db_helper
from dependence.role_checker import PermissionRequired
from fastapi import APIRouter, Depends, Header, status
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from .repository import get_user_repository
from .schemas import (
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

router = APIRouter(
    tags=["User"],
    prefix="/user",
)


@router.post(
    "/login",
    response_model=UserLoginResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def login(data: UserLoginRequest, session: AsyncSession = Depends(db_helper.session_getter)):
    return await auth_service.login(session=session, data=data)




@router.get("/me", response_model=UserMeResponse)
# @cache(expire=60, key_builder=custom_key_builder)
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
    # Используем Depends для инъекции сессии
    session: AsyncSession = Depends(db_helper.session_getter),
):
    result = await get_user_repository.create_user(session=session, data=data)
    # await clear_cache(list_users)
    return result


@router.get("/{user_id}", response_model=UserCreateResponse)
# @cache(expire=60, key_builder=custom_key_builder)
async def get_user(
    user_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:user")),
):
    return await get_user_repository.get_user(session=session, user_id=user_id)


@router.get("/", response_model=UserListResponse)
# @cache(expire=60, key_builder=custom_key_builder)
async def list_users(
    # Используем Depends, чтобы параметры шли из Query string (?page=1&limit=10)
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
    # await clear_cache(list_users)
    # await clear_cache(get_user, user_id=user_id)
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
    _: PermissionRequired = Depends(PermissionRequired("create:user")),  # Assuming admin permission needed
):
    await get_user_repository.assign_roles(session=session, data=data)
    return {"message": "Roles assigned successfully"}
    # await clear_cache(list_users)
    # await clear_cache(get_user, user_id=user_id)
