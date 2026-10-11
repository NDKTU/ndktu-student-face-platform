from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import User

from . import account_repository as repo
from .schemas import ZoomAccountCheckResponse, ZoomAccountListResponse, ZoomAccountRequest, ZoomAccountResponse

# Ruxsatlar route'dan topiladi va faqat Admin'ga avtomatik beriladi.
router = APIRouter(prefix="/zoom-accounts", tags=["Zoom accounts"])


@router.get("/", response_model=ZoomAccountListResponse)
async def list_accounts(
    session: AsyncSession = Depends(db_helper.session_getter),
    _: User = Depends(PermissionRequired("read:zoom_account")),
):
    return await repo.list_accounts(session)


@router.post("/", response_model=ZoomAccountResponse, status_code=status.HTTP_201_CREATED)
async def create_account(
    data: ZoomAccountRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: User = Depends(PermissionRequired("create:zoom_account")),
):
    return await repo.create_account(session, data)


@router.put("/{account_id}", response_model=ZoomAccountResponse)
async def update_account(
    account_id: int,
    data: ZoomAccountRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: User = Depends(PermissionRequired("update:zoom_account")),
):
    return await repo.update_account(session, account_id, data)


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    account_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: User = Depends(PermissionRequired("delete:zoom_account")),
):
    await repo.delete_account(session, account_id)


@router.post("/{account_id}/check", response_model=ZoomAccountCheckResponse)
async def check_account(
    account_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: User = Depends(PermissionRequired("read:zoom_account")),
):
    """Kalitni sinash: token, host va uning litsenziyasi. `0` — `.env` akkaunti."""
    return await repo.check_account(session, account_id)
