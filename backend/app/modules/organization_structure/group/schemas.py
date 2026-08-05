from app.core.schemas import MAX_PAGE_SIZE, TashkentDatetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Дубль EDUCATION_FORMS из organization_structure/model.py: там ENUM базы,
# здесь проверка на входе. Менять нужно оба места разом — Literal нельзя
# собрать из кортежа, значения обязаны быть литералами.
#
# Sirtqi остаётся: заочное обучение прекращено, но записи прошлых лет должны
# читаться и редактироваться. Из выпадающего списка его убирает фронтенд.
EducationForm = Literal["Kunduzgi", "Kechki", "Masofaviy", "Sirtqi"]


class GroupCreateRequest(BaseModel):
    name: str
    # Специальность обязательна: это единственный путь группы к кафедре и
    # факультету. Раньше рядом лежал faculty_id, который мог ей противоречить.
    speciality_id: int
    # Поля карточки, которые показывает дерево структуры. Все необязательные:
    # запись заводят по названию, остальное дозаполняют позже.
    kurs: Optional[int] = Field(default=None, ge=1, le=10)
    sardor_student_id: Optional[int] = None
    # Форма обучения — свойство группы: «8-24 ENI» целиком кундузги.
    education_form: Optional[EducationForm] = None

    @field_validator("name", mode="before")
    @classmethod
    def name_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip()


class GroupCreateResponse(BaseModel):
    id: int
    name: str
    # Нужен домашней странице студента: по нему она достаёт учебный план.
    speciality_id: int
    created_at: TashkentDatetime
    updated_at: TashkentDatetime
    kurs: Optional[int] = None
    sardor_student_id: Optional[int] = None
    education_form: Optional[EducationForm] = None
    position: int = 0

    model_config = ConfigDict(
        from_attributes=True,
    )


class GroupListRequest(BaseModel):
    name: Optional[str] = None
    faculty_id: Optional[int] = None
    teacher_id: Optional[int] = None

    page: int = 1

    limit: int = Field(default=10, ge=1, le=MAX_PAGE_SIZE)

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
