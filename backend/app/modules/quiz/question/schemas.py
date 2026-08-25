from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.core.enums import QuestionType
from app.core.schemas import TashkentDatetime

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
    question_type: QuestionType = QuestionType.QUIZ

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
    question_type: QuestionType
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


class QuestionSubjectSummary(BaseModel):
    subject_id: int
    subject_name: str
    question_count: int


class QuestionTeacherSummary(BaseModel):
    teacher_user_id: int
    username: str
    full_name: Optional[str] = None
    kafedra_id: Optional[int] = None
    kafedra_name: Optional[str] = None
    question_count: int
    subjects: list[QuestionSubjectSummary]


class QuestionCatalogResponse(BaseModel):
    teachers: list[QuestionTeacherSummary]


class QuestionExcelUploadResponse(BaseModel):
    questions: list[QuestionCreateResponse]
    warnings: list[str] = []
