from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.schemas import TashkentDatetime

OptionLetter = Literal["a", "b", "c", "d"]


class _LowerLetter(BaseModel):
    @field_validator("correct_option", mode="before", check_fields=False)
    @classmethod
    def _lower(cls, value):
        # В Excel и в форме буква приходит и как «B», и как «b».
        return value.strip().lower() if isinstance(value, str) else value


# ─── Тест (управление) ───────────────────────────────────────────────────────


class GeneralTestCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    duration: int = Field(default=30, ge=1, le=600)
    attempt_limit: int = Field(default=1, ge=1, le=100)
    is_active: bool = False


class GeneralTestUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    duration: int | None = Field(default=None, ge=1, le=600)
    attempt_limit: int | None = Field(default=None, ge=1, le=100)
    is_active: bool | None = None


class GeneralTestSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    duration: int
    attempt_limit: int
    is_active: bool
    question_count: int = 0
    attempt_count: int = 0
    created_at: TashkentDatetime


class GeneralTestListResponse(BaseModel):
    total: int
    page: int
    limit: int
    tests: list[GeneralTestSummary]


# ─── Вопросы ─────────────────────────────────────────────────────────────────


class QuestionCreateRequest(_LowerLetter):
    text: str = Field(min_length=1)
    option_a: str = Field(min_length=1)
    option_b: str = Field(min_length=1)
    option_c: str = Field(min_length=1)
    option_d: str = Field(min_length=1)
    correct_option: OptionLetter = "a"
    order: int | None = None


class QuestionUpdateRequest(_LowerLetter):
    text: str | None = Field(default=None, min_length=1)
    option_a: str | None = Field(default=None, min_length=1)
    option_b: str | None = Field(default=None, min_length=1)
    option_c: str | None = Field(default=None, min_length=1)
    option_d: str | None = Field(default=None, min_length=1)
    correct_option: OptionLetter | None = None
    order: int | None = None


class QuestionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    test_id: int
    text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_option: str
    order: int


class GeneralTestDetail(GeneralTestSummary):
    questions: list[QuestionResponse] = []


class UploadResponse(BaseModel):
    created: int
    warnings: list[str]


# ─── Прохождение ─────────────────────────────────────────────────────────────


class AvailableTest(BaseModel):
    id: int
    title: str
    description: str | None
    duration: int
    attempt_limit: int
    question_count: int
    attempts_used: int
    #: Незавершённая попытка — «Davom ettirish» вместо «Boshlash».
    in_progress_attempt_id: int | None = None
    best_score: int | None = None


class AvailableTestListResponse(BaseModel):
    tests: list[AvailableTest]


class TakeOption(BaseModel):
    #: Исходная буква варианта. Правильный ответ из неё не следует —
    #: на экране варианты перемешаны.
    key: str
    text: str


class TakeQuestion(BaseModel):
    id: int
    text: str
    options: list[TakeOption]
    selected: str | None = None


class AttemptState(BaseModel):
    attempt_id: int
    test_id: int
    title: str
    remaining_seconds: int
    questions: list[TakeQuestion]


class AnswerRequest(BaseModel):
    question_id: int
    option: OptionLetter

    @field_validator("option", mode="before")
    @classmethod
    def _lower(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


class AttemptResult(BaseModel):
    attempt_id: int
    test_id: int
    title: str
    total_questions: int
    correct_answers: int
    score: int
    started_at: TashkentDatetime
    finished_at: TashkentDatetime | None


class MyResultListResponse(BaseModel):
    results: list[AttemptResult]


# ─── Результаты (администратор) ──────────────────────────────────────────────


class ResultListRequest(BaseModel):
    test_id: int | None = None
    search: str | None = None
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=500)


class ResultRow(BaseModel):
    attempt_id: int
    test_id: int
    test_title: str
    user_id: int | None
    full_name: str
    username: str | None
    group_name: str | None
    #: student / teacher / boshqa — по тому, чей профиль нашёлся.
    user_kind: str
    total_questions: int
    correct_answers: int
    score: int
    started_at: TashkentDatetime
    finished_at: TashkentDatetime | None


class ResultListResponse(BaseModel):
    total: int
    page: int
    limit: int
    results: list[ResultRow]

