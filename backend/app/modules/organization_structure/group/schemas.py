from app.core.schemas import TashkentDatetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator


class GroupCreateRequest(BaseModel):
    name: str
    faculty_id: int
    # Поля карточки, которые показывает дерево структуры. Все необязательные:
    # запись заводят по названию, остальное дозаполняют позже.
    kurs: Optional[int] = None
    sardor_student_id: Optional[int] = None

    @field_validator("name", mode="before")
    @classmethod
    def name_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip()


class GroupCreateResponse(BaseModel):
    id: int
    name: str
    faculty_id: int
    # Нужен домашней странице студента: по нему она достаёт учебный план.
    speciality_id: Optional[int] = None
    created_at: TashkentDatetime
    updated_at: TashkentDatetime
    kurs: Optional[int] = None
    sardor_student_id: Optional[int] = None
    position: int = 0

    model_config = ConfigDict(
        from_attributes=True,
    )


class GroupListRequest(BaseModel):
    name: Optional[str] = None
    faculty_id: Optional[int] = None
    teacher_id: Optional[int] = None

    page: int = 1

    limit: int = 10

    @property
    def offset(self) -> int:
        if self.page < 1:
            return 0
        return (self.page - 1) * self.limit


class GroupListResponse(BaseModel):
    total: int
    page: int
    limit: int
    groups: list[GroupCreateResponse]
