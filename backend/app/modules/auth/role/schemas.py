from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.core.schemas import TashkentDatetime

# `core/utils/data_scope.py::DATA_SCOPES` bilan bir xil.
DataScopeName = Literal["all", "faculty", "kafedra", "assigned_groups", "own"]


class RoleCreateRequest(BaseModel):
    name: str
    # Bo'sh — yaratishda `own`, tahrirlashda o'zgarmaydi.
    data_scope: DataScopeName | None = None


class RolePermissionAssignRequest(BaseModel):
    role_id: int
    permission_ids: list[int]

    model_config = ConfigDict(
        str_strip_whitespace=True,
        str_to_lower=True,
    )


class RolePermissionInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class RoleCreateResponse(BaseModel):
    id: int
    name: str
    data_scope: DataScopeName
    created_at: TashkentDatetime
    updated_at: TashkentDatetime
    permissions: list[RolePermissionInfo] = []

    model_config = ConfigDict(from_attributes=True)


class RoleListRequest(BaseModel):
    page: int = 1
    limit: int = 10
    name: str | None = None

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.limit


class RoleListResponse(BaseModel):
    total: int
    page: int
    limit: int
    roles: list[RoleCreateResponse]
