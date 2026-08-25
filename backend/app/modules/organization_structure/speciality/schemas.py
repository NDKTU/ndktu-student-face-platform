from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.core.enums import EducationType
from app.core.schemas import ExternalRefFields, TashkentDatetime


class SpecialityCreateRequest(BaseModel):
    name: str
    kafedra_id: int
    education_type: Optional[EducationType] = None

    @field_validator("name", mode="before")
    @classmethod
    def name_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip()

    @field_validator("education_type", mode="before")
    @classmethod
    def blank_education_type_is_none(cls, v: Optional[str]) -> Optional[str]:
        # Пустой select на фронте приходит как "" — считаем это «не указано».
        return v or None


class SpecialityUpdateRequest(BaseModel):
    name: Optional[str] = None
    kafedra_id: Optional[int] = None
    education_type: Optional[EducationType] = None

    @field_validator("name", mode="before")
    @classmethod
    def name_must_not_be_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            if not v.strip():
                raise ValueError("Name cannot be empty")
            return v.strip()
        return v

    @field_validator("education_type", mode="before")
    @classmethod
    def blank_education_type_is_none(cls, v: Optional[str]) -> Optional[str]:
        return v or None


class SpecialityResponse(ExternalRefFields):
    id: int
    name: str
    kafedra_id: int
    # EPOS EducationType: Bakalavr | Magistr (у ручных записей может быть пусто)
    education_type: Optional[EducationType] = None
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(from_attributes=True)


class SpecialityListRequest(BaseModel):
    name: Optional[str] = None
    kafedra_id: Optional[int] = None
    faculty_id: Optional[int] = None
    page: int = 1
    limit: int = 20

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


class SpecialityStatsItem(BaseModel):
    speciality_id: int
    group_count: int
    student_count: int


class SpecialityStatsResponse(BaseModel):
    stats: list[SpecialityStatsItem]
