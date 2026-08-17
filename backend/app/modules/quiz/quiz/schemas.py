from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.core.schemas import TashkentDatetime

ProctoringMode = Literal["face", "standard"]


class QuizCreateRequest(BaseModel):
    title: str
    question_number: int
    duration: int
    pin: str
    user_id: Optional[int] = None
    group_id: Optional[int] = None
    subject_id: Optional[int] = None
    is_active: bool = False
    proctoring_mode: ProctoringMode = "standard"

    @field_validator("title", "pin", mode="before")
    @classmethod
    def must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Field cannot be empty")
        return v.strip()


class QuizCreateResponse(BaseModel):
    id: int
    title: str
    question_number: int
    duration: int
    pin: str
    is_active: bool
    proctoring_mode: ProctoringMode
    attempt: Optional[int] = 1
    user_id: Optional[int]
    group_id: Optional[int]
    subject_id: Optional[int]
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(
        from_attributes=True,
    )


class QuizListRequest(BaseModel):
    title: Optional[str] = None
    user_id: Optional[int] = None
    group_id: Optional[int] = None
    subject_id: Optional[int] = None
    is_active: Optional[bool] = None
    proctoring_mode: Optional[ProctoringMode] = None

    page: int = 1

    limit: int = 10
    sort_dir: Optional[str] = "desc"

    @property
    def offset(self) -> int:
        if self.page < 1:
            return 0
        return (self.page - 1) * self.limit


class QuizListResponse(BaseModel):
    total: int
    page: int
    limit: int
    quizzes: list[QuizCreateResponse]
