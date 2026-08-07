from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.schemas import MAX_PAGE_SIZE, TashkentDatetime


class KafedraInfo(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class SubjectCreateRequest(BaseModel):
    name: str
    # Поля карточки, которые показывает дерево структуры. Все необязательные:
    # запись заводят по названию, остальное дозаполняют позже.
    kafedra_id: Optional[int] = None
    code: Optional[str] = None
    credit: Optional[int] = None
    semester: Optional[int] = None
    description: Optional[str] = None

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
    kafedra_id: Optional[int] = None
    kafedra: Optional[KafedraInfo] = None
    code: Optional[str] = None
    credit: Optional[int] = None
    semester: Optional[int] = None
    description: Optional[str] = None

    model_config = ConfigDict(
        from_attributes=True,
    )


class SubjectListRequest(BaseModel):
    name: Optional[str] = None

    page: int = 1

    teacher_id: Optional[int] = None
    limit: int = Field(default=10, ge=1, le=MAX_PAGE_SIZE)

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
