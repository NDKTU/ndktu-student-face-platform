import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import Permission, Role, RolePermission

from .defaults import SEEDED_ROLE_PERMISSIONS

logger = logging.getLogger(__name__)


async def assign_admin_permissions(
    session: AsyncSession,
    existing_perms: dict[str, Permission],
    admin_role: Role,
) -> None:
    """Grant Admin every database permission, including newly discovered ones.

    Existing links are preserved; repeated startup only adds missing links.
    """
    current_role_perms_stmt = select(RolePermission).where(RolePermission.role_id == admin_role.id)
    current_role_perm_ids = {rp.permission_id for rp in (await session.execute(current_role_perms_stmt)).scalars()}

    assigned_count = 0
    for perm in existing_perms.values():
        if perm.id not in current_role_perm_ids:
            session.add(RolePermission(role_id=admin_role.id, permission_id=perm.id))
            current_role_perm_ids.add(perm.id)
            assigned_count += 1

    if assigned_count > 0:
        logger.info(f"Assigned {assigned_count} new permissions to role 'Admin'")

    await session.commit()


async def seed_role_permissions(
    session: AsyncSession,
    existing_perms: dict[str, Permission],
) -> None:
    """``teacher`` va ``student`` rollariga yetishmagan ruxsatlarni qo'shadi.

    Admin'dan farqli: bu yerda hech narsa OLIB TASHLANMAYDI. Admin panelidan
    berilgan qo'shimcha huquq keyingi ishga tushishda yo'qolmasligi kerak —
    aks holda «ruxsat berdim, ertalab yo'q» degan holat chiqardi.

    Rol yo'q bo'lsa yaratiladi: bo'sh bazada ko'tarilgan yangi muhit
    o'qituvchi va talabani qo'lda sozlashni talab qilmasligi kerak.

    Ro'yxatdagi ruxsat bazada topilmasa (kod eskirgan yoki nomi
    o'zgargan) — ogohlantirish yoziladi va u o'tkazib yuboriladi. Jim
    o'tkazib yuborish yaramaydi: shunda rol sababi ko'rinmagan holda
    kamchil qolardi.
    """
    for role_name, wanted in SEEDED_ROLE_PERMISSIONS.items():
        role = (
            await session.execute(select(Role).where(Role.name == role_name))
        ).scalar_one_or_none()

        if role is None:
            role = Role(name=role_name)
            session.add(role)
            await session.flush()
            logger.info("Created role: %s", role_name)

        have = {
            pid
            for pid in (
                await session.execute(
                    select(RolePermission.permission_id).where(
                        RolePermission.role_id == role.id
                    )
                )
            )
            .scalars()
            .all()
        }

        unknown = [name for name in wanted if name not in existing_perms]
        if unknown:
            logger.warning(
                "Role '%s': permissions not found in DB, skipped: %s",
                role_name,
                ", ".join(unknown),
            )

        added = 0
        for name in wanted:
            perm = existing_perms.get(name)
            if perm and perm.id not in have:
                session.add(RolePermission(role_id=role.id, permission_id=perm.id))
                have.add(perm.id)
                added += 1

        if added:
            logger.info("Assigned %d new permissions to role '%s'", added, role_name)

    await session.commit()
