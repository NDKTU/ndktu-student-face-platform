from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.core.schemas import ExternalRefFields, TashkentDatetime


class SubjectCreateRequest(BaseModel):
    name: str

    @field_validator("name", mode="before")
    @classmethod
    def name_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip().lower()


class SubjectCreateResponse(ExternalRefFields):
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
