import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.permission.model import Permission
from app.modules.auth.role.model import Role, RolePermission

logger = logging.getLogger(__name__)


async def assign_admin_permissions(
    session: AsyncSession,
    discovered_permissions: set[str],
    existing_perms: dict[str, Permission],
    admin_role: Role,
) -> None:
    """Admin is force-synced to every discovered permission on every boot, so
    the system can never be locked out of its own permission set."""
    current_role_perms_stmt = select(RolePermission).where(RolePermission.role_id == admin_role.id)
    current_role_perm_ids = {rp.permission_id for rp in (await session.execute(current_role_perms_stmt)).scalars()}

    assigned_count = 0
    for perm_name in discovered_permissions:
        perm = existing_perms.get(perm_name)
        if perm and perm.id not in current_role_perm_ids:
            session.add(RolePermission(role_id=admin_role.id, permission_id=perm.id))
            assigned_count += 1

    if assigned_count > 0:
        logger.info(f"Assigned {assigned_count} new permissions to role 'Admin'")

    await session.commit()
