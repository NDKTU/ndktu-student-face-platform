from app.core.schemas import TashkentDatetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator


class SubjectCreateRequest(BaseModel):
    name: str

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


class SubjectCreateResponse(BaseModel):
    id: int
    name: str
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(
        from_attributes=True,
    )


class SubjectListRequest(BaseModel):
    name: Optional[str] = None

    page: int = 1

    teacher_id: Optional[int] = None
    limit: int = 10

    @property
    def offset(self) -> int:
        if self.page < 1:
            return 0
        return (self.page - 1) * self.limit


class SubjectListResponse(BaseModel):
    total: int
    page: int
    limit: int
    subjects: list[SubjectCreateResponse]
