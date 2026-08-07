from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from .repository import get_tree_repository
from .schemas import OrganizationTreeResponse

router = APIRouter(
    tags=["Organization"],
    prefix="/organization",
)


@router.get("/tree", response_model=OrganizationTreeResponse)
async def get_organization_tree(
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:faculty")),
):
    return await get_tree_repository.build(session=session)
