from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.core.enums import QuestionType
from app.core.schemas import TashkentDatetime

CorrectOption = Literal["a", "b", "c", "d"]


class TrueFalsePayload(BaseModel):
    """To'g'ri/noto'g'ri savol: javob bitta mantiqiy qiymat."""

    correct: bool


class MultiSelectPayload(BaseModel):
    """Bir nechta to'g'ri javobli savol.

    Ball faqat to'liq mos kelganda beriladi — qisman ball butun baholash
    tizimini o'zgartirishni talab qiladi, u alohida qaror.
    """

    options: list[str]
    correct: list[int]

    @field_validator("options")
    @classmethod
    def enough_options(cls, value: list[str]) -> list[str]:
        cleaned = [item.strip() for item in value if item and item.strip()]
        if len(cleaned) < 2:
            raise ValueError("Kamida ikkita variant kerak")
        if len(cleaned) > 10:
            raise ValueError("Variantlar soni 10 tadan oshmasin")
        return cleaned

    @model_validator(mode="after")
    def correct_within_options(self):
        if not self.correct:
            raise ValueError("Kamida bitta to'g'ri javob belgilanishi kerak")
        if len(set(self.correct)) != len(self.correct):
            raise ValueError("To'g'ri javoblar takrorlanmasin")
        if any(index < 0 or index >= len(self.options) for index in self.correct):
            raise ValueError("To'g'ri javob raqami variantlar orasida bo'lishi kerak")
        if len(self.correct) == len(self.options):
            raise ValueError("Hamma variant to'g'ri bo'lsa, savolning ma'nosi qolmaydi")
        self.correct = sorted(self.correct)
        return self


# Turlar uchun `payload` sxemasi. `QUIZ` eski ustunlarda qoladi.
PAYLOAD_SCHEMA = {
    QuestionType.TRUE_FALSE: TrueFalsePayload,
    QuestionType.MULTI_SELECT: MultiSelectPayload,
}


class QuestionCreateRequest(BaseModel):
    subject_id: int
    user_id: int
    text: str
    # `QUIZ` dan boshqa turlarda variantlar `payload` da, shuning uchun bu
    # ustunlar majburiy emas — ular faqat eski tur uchun.
    option_a: str = ""
    option_b: str = ""
    option_c: str = ""
    option_d: str = ""
    correct_option: CorrectOption = "a"
    question_type: QuestionType = QuestionType.QUIZ
    payload: Optional[dict] = None

    @field_validator("text", mode="before")
    @classmethod
    def text_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Field cannot be empty")
        return v.strip()

    @model_validator(mode="after")
    def check_type_shape(self):
        if self.question_type == QuestionType.QUIZ:
            missing = [
                name for name in ("option_a", "option_b", "option_c", "option_d")
                if not (getattr(self, name) or "").strip()
            ]
            if missing:
                raise ValueError("Barcha to'rt variant to'ldirilishi kerak")
            self.payload = None
            return self

        schema = PAYLOAD_SCHEMA.get(self.question_type)
        if schema is None:
            raise ValueError(f"{self.question_type.value} turi hali qo'llab-quvvatlanmaydi")

        # Tekshirilgan holatda saqlaymiz: bazaga faqat to'g'ri shakl tushadi.
        self.payload = schema.model_validate(self.payload or {}).model_dump()

        # Eski ustunlar NOT NULL — turi boshqa savollarda ular bo'sh satr.
        self.option_a = self.option_a or ""
        self.option_b = self.option_b or ""
        self.option_c = self.option_c or ""
        self.option_d = self.option_d or ""
        return self


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
    payload: Optional[dict] = None
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
