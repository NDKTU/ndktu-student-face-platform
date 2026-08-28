from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

from app.modules.quiz.quiz_process.schemas import QuestionDTO


class PublicStartRequest(BaseModel):
    """Ochiq testni boshlash: PIN va ishtirokchi ismi.

    Ism tekshirilmaydi — ochiq testda buning iloji yo'q. U faqat natijada
    kim yechganini ko'rsatish uchun.
    """

    pin: str = Field(min_length=1, max_length=32)
    full_name: str = Field(min_length=3, max_length=150)

    @field_validator("pin", "full_name", mode="before")
    @classmethod
    def strip_value(cls, value: str) -> str:
        return (value or "").strip()


class PublicStartResponse(BaseModel):
    # Bitta urinishga bog'langan token: tizimda hech qanday huquq bermaydi.
    guest_token: str
    result_id: int
    quiz_id: int
    title: str
    duration: int
    remaining_seconds: int
    questions: List[QuestionDTO]


class PublicAnswerRequest(BaseModel):
    question_id: int
    answer_index: int = Field(ge=0, le=3)


class PublicAnswerResponse(BaseModel):
    question_id: int
    accepted: bool = True


class PublicFinishResponse(BaseModel):
    total_questions: int
    correct_answers: int
    wrong_answers: int
    grade: int
    full_name: Optional[str] = None
    title: Optional[str] = None
