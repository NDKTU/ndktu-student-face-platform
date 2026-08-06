from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base import Base
from app.core.mixins.id_int_pk import IdIntPk
from app.core.mixins.time_stamp_mixin import TimestampMixin

if TYPE_CHECKING:
    from app.modules.auth.role.model import Role


class Permission(Base, IdIntPk, TimestampMixin):
    __tablename__ = "permissions"

    name: Mapped[str] = mapped_column(String(50), unique=True)

    roles: Mapped[list["Role"]] = relationship(
        "Role",
        secondary="role_permissions",
        back_populates="permissions",
        overlaps="role_permissions,role,permission",
    )

    def __str__(self):
        return self.name
