from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.permission.model import Permission
    from app.modules.auth.user.model import User


class Role(Base, IdIntPk, TimestampMixin):
    __tablename__ = "roles"

    # UNIQUE по lower(name), а не по name: код сравнивает роли через
    # func.lower() (role/repository.py), и обычное ограничение пропускало
    # «Dekan» рядом с «dekan» — для приложения это одна и та же роль.
    __table_args__ = (Index("uq_roles_name_lower", text("lower(name)"), unique=True),)

    name: Mapped[str] = mapped_column(String(50))

    users: Mapped[list["User"]] = relationship(
        "User", secondary="user_roles", back_populates="roles", overlaps="user_roles"
    )

    permissions: Mapped[list["Permission"]] = relationship(
        "Permission",
        secondary="role_permissions",
        back_populates="roles",
        overlaps="role_permissions",
    )

    def __str__(self):
        return self.name


class RolePermission(Base, IdIntPk, TimestampMixin):
    __tablename__ = "role_permissions"

    # Как и в user_roles: обе стороны участвуют в проверке права.
    role_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("roles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    permission_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False, index=True
    )

    role: Mapped["Role"] = relationship("Role", lazy="selectin", overlaps="permissions")
    permission: Mapped["Permission"] = relationship("Permission", lazy="selectin", overlaps="permissions")

    def __str__(self) -> str:
        return f"{self.role} → {self.permission}"
