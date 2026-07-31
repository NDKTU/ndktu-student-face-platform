from app.core.schemas import MAX_PAGE_SIZE, TashkentDatetime, normalized_name
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

NAME_MAX = 255
# Шифр специальности — только цифры (60610300). Буквы туда попадали лишь по
# ошибке ввода, а столбец всё равно String(16).
CODE_PATTERN = r"^\d*$"
CODE_MAX = 16


class SpecialityCreateRequest(BaseModel):
    name: str = Field(max_length=NAME_MAX)
    kafedra_id: int
    # Поля карточки, которые показывает дерево структуры. Все необязательные:
    # запись заводят по названию, остальное дозаполняют позже.
    code: Optional[str] = Field(default=None, max_length=CODE_MAX, pattern=CODE_PATTERN)
    education_form: Optional[str] = Field(default=None, max_length=32)
    academic_year: Optional[str] = Field(default=None, max_length=16)

    @field_validator("name", mode="before")
    @classmethod
    def name_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Name cannot be empty")
        return normalized_name(v)


class SpecialityUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, max_length=NAME_MAX)
    kafedra_id: Optional[int] = None
    # Эти три поля репозиторий перебирает при обновлении, но в схеме их не было —
    # pydantic молча выбрасывал их из запроса, и после создания шифр и форму
    # обучения нельзя было исправить вообще ничем.
    code: Optional[str] = Field(default=None, max_length=CODE_MAX, pattern=CODE_PATTERN)
    education_form: Optional[str] = Field(default=None, max_length=32)
    academic_year: Optional[str] = Field(default=None, max_length=16)

    @field_validator("name", mode="before")
    @classmethod
    def name_must_not_be_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if not v.strip():
            raise ValueError("Name cannot be empty")
        return normalized_name(v)


class SpecialityResponse(BaseModel):
    id: int
    name: str
    kafedra_id: int
    created_at: TashkentDatetime
    updated_at: TashkentDatetime
    code: Optional[str] = None
    education_form: Optional[str] = None
    academic_year: Optional[str] = None
    position: int = 0

    model_config = ConfigDict(from_attributes=True)


class SpecialityListRequest(BaseModel):
    name: Optional[str] = None
    kafedra_id: Optional[int] = None
    faculty_id: Optional[int] = None
    page: int = 1
    limit: int = Field(default=20, ge=1, le=MAX_PAGE_SIZE)

    @property
    def offset(self) -> int:
        if self.page < 1:
            return 0
        return (self.page - 1) * self.limit


class SpecialityListResponse(BaseModel):
    total: int
    page: int
    limit: int
    specialities: list[SpecialityResponse]
