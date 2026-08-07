from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.schemas import MAX_PAGE_SIZE, TashkentDatetime


class RoleCreateRequest(BaseModel):
    # Столбец `roles.name` — String(50).
    name: str = Field(max_length=50)

    @field_validator("name", mode="before")
    @classmethod
    def clean_name(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Role name cannot be empty")
        # Только пробелы: регистр оставляем как ввели — имя роли видно в
        # интерфейсе. Совпадение по имени везде идёт через `func.lower`, так
        # что «Dekan» и «dekan» и так считаются одной ролью.
        return " ".join(v.split())


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
    created_at: TashkentDatetime
    updated_at: TashkentDatetime
    permissions: list[RolePermissionInfo] = []

    model_config = ConfigDict(from_attributes=True)


class RoleListRequest(BaseModel):
    page: int = 1
    limit: int = Field(default=10, ge=1, le=MAX_PAGE_SIZE)
    name: str | None = None

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.limit


class RoleListResponse(BaseModel):
    total: int
    page: int
    limit: int
    roles: list[RoleCreateResponse]
