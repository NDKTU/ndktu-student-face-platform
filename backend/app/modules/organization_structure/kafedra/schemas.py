from app.core.schemas import TashkentDatetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator


class KafedraCreateRequest(BaseModel):
    name: str
    faculty_id: int

    @field_validator("name", mode="before")
    @classmethod
    def name_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip()


class KafedraCreateResponse(BaseModel):
    id: int
    name: str
    faculty_id: int
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(
        from_attributes=True,
    )


class KafedraListRequest(BaseModel):
    name: Optional[str] = None
    faculty_id: Optional[int] = None

    page: int = 1

    limit: int = 10

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
