from app.core.schemas import TashkentDatetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

CorrectOption = Literal["a", "b", "c", "d"]


class QuestionCreateRequest(BaseModel):
    subject_id: int
    user_id: int
    text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_option: CorrectOption = "a"

    @field_validator("text", "option_a", "option_b", "option_c", "option_d", mode="before")
    @classmethod
    def must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Field cannot be empty")
        return v.strip()


class QuestionBulkDeleteRequest(BaseModel):
    subject_id: int
    user_id: int


class QuestionCreateResponse(BaseModel):
    id: int
    subject_id: int
    user_id: int
    subject_name: Optional[str] = None
    username: Optional[str] = None
    text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_option: CorrectOption
    version: int
    is_latest: bool
    is_active: bool
    original_question_id: Optional[int] = None
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(
        from_attributes=True,
    )

    @model_validator(mode="before")
    @classmethod
    def extract_names(cls, data):
        if hasattr(data, "__dict__"):
            if "subject" in data.__dict__ and data.subject:
                data.subject_name = data.subject.name
            if "user" in data.__dict__ and data.user:
                data.username = data.user.username
        return data


class QuestionListRequest(BaseModel):
    text: Optional[str] = None
    subject_id: Optional[int] = None
    user_id: Optional[int] = None

    page: int = 1

    limit: int = 10

    @property
    def offset(self) -> int:
        if self.page < 1:
            return 0
        return (self.page - 1) * self.limit


class QuestionListResponse(BaseModel):
    total: int
    page: int
    limit: int
    questions: list[QuestionCreateResponse]


class QuestionExcelUploadResponse(BaseModel):
    questions: list[QuestionCreateResponse]
    warnings: list[str] = []
