from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.schemas import MAX_PAGE_SIZE, TashkentDatetime, normalized_name


class KafedraCreateRequest(BaseModel):
    name: str = Field(max_length=255)
    faculty_id: int
    # Поля карточки, которые показывает дерево структуры. Все необязательные:
    # запись заводят по названию, остальное дозаполняют позже.
    mudir_employee_id: Optional[int] = None

    @field_validator("name", mode="before")
    @classmethod
    def name_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Name cannot be empty")
        return normalized_name(v)


class KafedraUpdateRequest(BaseModel):
    """Частичное обновление: форма присылает только то, что правила.

    Отдельная схема, а не переиспользование Create: там `faculty_id` обязателен,
    и правка одного названия кафедры падала с 422 «Field required». Репозиторий
    и так проверяет каждое поле на None — не хватало только схемы.
    """

    name: Optional[str] = Field(default=None, max_length=255)
    faculty_id: Optional[int] = None
    mudir_employee_id: Optional[int] = None

    @field_validator("name", mode="before")
    @classmethod
    def name_must_not_be_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not v.strip():
            raise ValueError("Name cannot be empty")
        return normalized_name(v)


class KafedraCreateResponse(BaseModel):
    id: int
    name: str
    faculty_id: int
    created_at: TashkentDatetime
    updated_at: TashkentDatetime
    mudir_employee_id: Optional[int] = None
    position: int = 0

    model_config = ConfigDict(
        from_attributes=True,
    )


class KafedraListRequest(BaseModel):
    name: Optional[str] = None
    faculty_id: Optional[int] = None

    page: int = 1

    limit: int = Field(default=10, ge=1, le=MAX_PAGE_SIZE)

    @property
    def offset(self) -> int:
        if self.page < 1:
            return 0
        return (self.page - 1) * self.limit


class KafedraListResponse(BaseModel):
    total: int
    page: int
    limit: int
    kafedras: list[KafedraCreateResponse]
