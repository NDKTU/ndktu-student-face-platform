from pydantic import BaseModel, ConfigDict

from app.core.schemas import TashkentDatetime


class PermissionResponse(BaseModel):
    id: int
    name: str
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(from_attributes=True)


class PermissionListRequest(BaseModel):
    page: int = 1
    limit: int = 10
    name: str | None = None

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.limit


class PermissionListResponse(BaseModel):
    total: int
    page: int
    limit: int
    permissions: list[PermissionResponse]
