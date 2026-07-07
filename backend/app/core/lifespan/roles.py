import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import Role

from .defaults import ADMIN_ROLE_NAME

logger = logging.getLogger(__name__)


async def sync_admin_role(session: AsyncSession) -> tuple[Role, bool]:
    """
    Ensure the Admin role exists, returning (role, was_just_created).
    Only Admin is auto-seeded — see defaults.py for why.
    """
    existing = (await session.execute(select(Role).where(Role.name == ADMIN_ROLE_NAME))).scalar_one_or_none()
    if existing:
        return existing, False

    role = Role(name=ADMIN_ROLE_NAME)
    session.add(role)
    await session.commit()
    await session.refresh(role)
    logger.info(f"Created role: {ADMIN_ROLE_NAME}")
    return role, True
