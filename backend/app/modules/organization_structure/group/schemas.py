from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.core.schemas import ExternalRefFields, TashkentDatetime


class GroupCreateRequest(BaseModel):
    name: str
    faculty_id: int

    @field_validator("name", mode="before")
    @classmethod
    def name_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip()


class GroupCreateResponse(ExternalRefFields):
    id: int
    name: str
    faculty_id: int
    speciality_id: Optional[int] = None
    course: Optional[int] = None
    education_shape: Optional[str] = None
    student_count: Optional[int] = None
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(
        from_attributes=True,
    )


class GroupListRequest(BaseModel):
    name: Optional[str] = None
    faculty_id: Optional[int] = None
    speciality_id: Optional[int] = None
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
