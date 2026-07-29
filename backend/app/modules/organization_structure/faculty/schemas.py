from app.core.schemas import TashkentDatetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator


class FacultyCreateRequest(BaseModel):
    name: str
    # Поля карточки, которые показывает дерево структуры. Все необязательные:
    # запись заводят по названию, остальное дозаполняют позже.
    code: Optional[str] = None
    dekan_user_id: Optional[int] = None
    dekan_name: Optional[str] = None
    color_bg: Optional[str] = None
    color_fg: Optional[str] = None

    @field_validator("name", mode="before")
    @classmethod
    def name_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Name cannot be empty")
        # .lower() здесь больше нет: названия показываются в интерфейсе как
        # есть, и «konchilik fakulteti» на карточке выглядело бы опечаткой.
        # Регистронезависимость обеспечивает проверка уникальности в
        # репозитории (func.lower), а не порча самих данных.
        return v.strip()


class FacultyCreateResponse(BaseModel):
    id: int
    name: str
    created_at: TashkentDatetime
    updated_at: TashkentDatetime
    code: Optional[str] = None
    dekan_user_id: Optional[int] = None
    dekan_name: Optional[str] = None
    color_bg: Optional[str] = None
    color_fg: Optional[str] = None
    position: int = 0

    model_config = ConfigDict(
        from_attributes=True,
    )


class FacultyListRequest(BaseModel):
    name: Optional[str] = None

    page: int = 1

    limit: int = 10

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
