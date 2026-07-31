from app.core.schemas import MAX_PAGE_SIZE, TashkentDatetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class UserAnswerQuestionInfo(BaseModel):
    id: int
    text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    model_config = ConfigDict(from_attributes=True)


class UserAnswerResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    quiz_id: Optional[int] = None
    question_id: Optional[int] = None
    result_id: Optional[int] = None
    answer: Optional[str] = None
    correct_answer: Optional[str] = None
    is_correct: bool
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    question: Optional[UserAnswerQuestionInfo] = None

    model_config = ConfigDict(from_attributes=True)


class UserAnswersListRequest(BaseModel):
    page: int = 1
    limit: int = Field(default=50, ge=1, le=MAX_PAGE_SIZE)
    user_id: Optional[int] = None
    quiz_id: Optional[int] = None
    question_id: Optional[int] = None
    result_id: Optional[int] = None

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.limit


class UserAnswersListResponse(BaseModel):
    total: int
    page: int
    limit: int
    answers: list[UserAnswerResponse]
