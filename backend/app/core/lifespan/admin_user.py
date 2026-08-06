import logging

from core.config import settings
from core.utils.password_hash import hash_password
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.role.model import Role
from app.modules.auth.user.model import User, UserRole

logger = logging.getLogger(__name__)


async def ensure_admin_user(session: AsyncSession, admin_role: Role) -> None:
    """
    Create the bootstrap admin user from APP_CONFIG__ADMIN__USERNAME/PASSWORD
    if it doesn't exist yet. Idempotent and non-destructive: if a user with
    that username already exists (e.g. its password was since changed via the
    UI), this does nothing — it never overwrites an existing account.
    """
    username = settings.admin.username
    password = settings.admin.password

    if not username or not password:
        logger.warning(
            "APP_CONFIG__ADMIN__USERNAME/PASSWORD not set — skipping bootstrap admin user creation."
        )
        return

    existing = (await session.execute(select(User).where(User.username == username))).scalar_one_or_none()
    if existing:
        logger.info(f"Admin user '{username}' already exists, leaving it untouched.")
        return

    user = User(username=username, password=hash_password(password))
    session.add(user)
    await session.flush()

    session.add(UserRole(user_id=user.id, role_id=admin_role.id))
    await session.commit()
    logger.info(f"Created bootstrap admin user '{username}'.")
