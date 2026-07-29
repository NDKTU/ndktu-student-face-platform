from app.core.schemas import TashkentDatetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

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


class QuizSubjectInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class QuizGroupInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class QuizTeacherInfo(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def take_full_name_from_employee(cls, data):
        # ФИО лежит в анкете сотрудника, а не в учётке.
        employee = getattr(data, "employee", None)
        if employee is not None and getattr(data, "full_name", None) is None:
            data.__dict__["full_name"] = employee.full_name
        return data


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
    # Список тестов показывает фан, группу и автора. Одни идентификаторы
    # заставили бы разрешать их на клиенте — по запросу на строку.
    subject: Optional[QuizSubjectInfo] = None
    group: Optional[QuizGroupInfo] = None
    teacher: Optional[QuizTeacherInfo] = None
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(
        from_attributes=True,
    )

    @model_validator(mode="before")
    @classmethod
    def alias_user_to_teacher(cls, data):
        # В модели автор теста называется `user`, а на экране это преподаватель.
        if hasattr(data, "__dict__") and "user" in data.__dict__:
            data.__dict__.setdefault("teacher", data.__dict__["user"])
        return data


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


# ── Аналитика теста ───────────────────────────────────────────────────────


class QuizDetailOption(BaseModel):
    letter: str
    text: str


class QuizDetailQuestion(BaseModel):
    id: int
    text: str
    options: list[QuizDetailOption]
    # Индекс правильного варианта. Здесь его отдавать можно: экран аналитики
    # смотрит преподаватель, а прохождение теста идёт через /quiz_process,
    # который правильных ответов не возвращает.
    correct: int


class QuizAttemptAnswer(BaseModel):
    question_id: int
    answer: Optional[str] = None
    is_correct: Optional[bool] = None


class QuizAttempt(BaseModel):
    result_id: int
    user_id: int
    full_name: str
    submitted: bool
    correct_answers: int
    wrong_answers: int
    total: int
    grade: int
    spent_seconds: Optional[int] = None
    finished_at: Optional[TashkentDatetime] = None
    answers: list[QuizAttemptAnswer]


class QuizQuestionStat(BaseModel):
    question_id: int
    correct: int
    wrong: int


class QuizDetailStats(BaseModel):
    submitted: int
    total_students: int
    avg_grade: float
    max_grade: int
    min_grade: int
    avg_seconds: Optional[int] = None


class QuizDetailResponse(BaseModel):
    quiz: QuizCreateResponse
    questions: list[QuizDetailQuestion]
    attempts: list[QuizAttempt]
    stats: QuizDetailStats
    per_question: list[QuizQuestionStat]
