from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.schemas import MAX_PAGE_SIZE, TashkentDatetime


class CurriculumSubjectInfo(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class CurriculumCreateRequest(BaseModel):
    speciality_id: int
    semester: int = Field(ge=1, le=12)
    credit: int = Field(default=0, ge=0, le=60)

    # Строку плана можно завести и по фану из справочника, и просто названием:
    # план часто составляют раньше, чем заводят фан.
    subject_id: Optional[int] = None
    subject_name: Optional[str] = None

    teacher_id: Optional[int] = None

    @field_validator("subject_name", mode="before")
    @classmethod
    def strip_blank_to_none(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        return v or None


class CurriculumUpdateRequest(BaseModel):
    semester: Optional[int] = Field(default=None, ge=1, le=12)
    credit: Optional[int] = Field(default=None, ge=0, le=60)
    subject_id: Optional[int] = None
    subject_name: Optional[str] = None
    teacher_id: Optional[int] = None
    position: Optional[int] = None

    @field_validator("subject_name", mode="before")
    @classmethod
    def strip_blank_to_none(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        v = v.strip()
        return v or None


class CurriculumResponse(BaseModel):
    id: int
    speciality_id: int
    subject_id: Optional[int] = None
    subject_name: str
    subject: Optional[CurriculumSubjectInfo] = None
    semester: int
    credit: int
    teacher_id: Optional[int] = None
    # ФИО ведущего — из карточки сотрудника, отдельного столбца под него нет.
    teacher_name: Optional[str] = None
    position: int
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def name_from_teacher(cls, data: Any) -> Any:
        """Раньше рядом лежал снимок teacher_name, и он расходился с карточкой
        сотрудника после переименования. Теперь имя собирается на лету."""
        teacher = getattr(data, "teacher", None)
        if teacher is not None and teacher.employee is not None:
            data.__dict__["teacher_name"] = teacher.employee.full_name
        return data


class CurriculumListRequest(BaseModel):
    speciality_id: Optional[int] = None
    semester: Optional[int] = None
    subject_id: Optional[int] = None
    page: int = 1
    limit: int = Field(default=200, ge=1, le=MAX_PAGE_SIZE)

    @property
    def offset(self) -> int:
        if self.page < 1:
            return 0
        return (self.page - 1) * self.limit


class CurriculumListResponse(BaseModel):
    total: int
    page: int
    limit: int
    curriculum: list[CurriculumResponse]


class CurriculumReorderRequest(BaseModel):
    """Новый порядок строк одного семестра: список id в нужной последовательности."""

    ids: list[int]
