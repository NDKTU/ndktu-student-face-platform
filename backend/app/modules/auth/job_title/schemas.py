from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.schemas import MAX_PAGE_SIZE, TashkentDatetime


class JobTitleCreateRequest(BaseModel):
    name: str

    @field_validator("name", mode="before")
    @classmethod
    def name_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip()


class JobTitleUpdateRequest(BaseModel):
    name: str

    @field_validator("name", mode="before")
    @classmethod
    def name_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip()


class JobTitleResponse(BaseModel):
    id: int
    name: str
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(from_attributes=True)


class JobTitleListRequest(BaseModel):
    name: Optional[str] = None

    page: int = 1

    limit: int = Field(default=10, ge=1, le=MAX_PAGE_SIZE)

    @property
    def offset(self) -> int:
        if self.page < 1:
            return 0
        return (self.page - 1) * self.limit


class JobTitleListResponse(BaseModel):
    total: int
    page: int
    limit: int
    job_titles: list[JobTitleResponse]
