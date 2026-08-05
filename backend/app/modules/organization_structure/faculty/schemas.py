from app.core.schemas import MAX_PAGE_SIZE, TashkentDatetime, normalized_name
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Столбец `faculties.name` — String(50). Без явного предела длинное название
# проходило Pydantic и падало уже в базе пятисоткой.
NAME_MAX = 50
CODE_MAX = 16


class FacultyCreateRequest(BaseModel):
    name: str = Field(max_length=NAME_MAX)
    # Поля карточки, которые показывает дерево структуры. Все необязательные:
    # запись заводят по названию, остальное дозаполняют позже.
    code: Optional[str] = Field(default=None, max_length=CODE_MAX)
    dekan_employee_id: Optional[int] = None
    color_bg: Optional[str] = None
    color_fg: Optional[str] = None

    @field_validator("name", mode="before")
    @classmethod
    def name_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Name cannot be empty")
        return normalized_name(v)


class FacultyUpdateRequest(BaseModel):
    """Частичное обновление: форма присылает только то, что правила.

    Отдельная схема, а не переиспользование Create: там `name` обязателен, и
    сменить одного декана, не трогая название, было нельзя.
    """

    name: Optional[str] = Field(default=None, max_length=NAME_MAX)
    code: Optional[str] = Field(default=None, max_length=CODE_MAX)
    dekan_employee_id: Optional[int] = None
    color_bg: Optional[str] = None
    color_fg: Optional[str] = None

    @field_validator("name", mode="before")
    @classmethod
    def name_must_not_be_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not v.strip():
            raise ValueError("Name cannot be empty")
        return normalized_name(v)


class FacultyCreateResponse(BaseModel):
    id: int
    name: str
    created_at: TashkentDatetime
    updated_at: TashkentDatetime
    code: Optional[str] = None
    dekan_employee_id: Optional[int] = None
    color_bg: Optional[str] = None
    color_fg: Optional[str] = None
    position: int = 0

    model_config = ConfigDict(
        from_attributes=True,
    )


class FacultyListRequest(BaseModel):
    name: Optional[str] = None

    page: int = 1

    limit: int = Field(default=10, ge=1, le=MAX_PAGE_SIZE)

    @property
    def offset(self) -> int:
        if self.page < 1:
            return 0
        return (self.page - 1) * self.limit


class FacultyListResponse(BaseModel):
    total: int
    page: int
    limit: int
    faculties: list[FacultyCreateResponse]
