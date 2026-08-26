from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator

from app.core.enums import QuizType
from app.core.schemas import TashkentDatetime

ProctoringMode = Literal["face", "standard"]


class QuizCreateRequest(BaseModel):
    # Название собирается на сервере из предмета, группы, даты и семестра.
    # Поле осталось необязательным ради старых клиентов: они всё ещё присылают
    # свой заголовок, и он имеет приоритет над сгенерированным.
    title: Optional[str] = None
    question_number: int
    duration: int
    pin: str
    # Лектор, чей банк вопросов собирается в тест. `user_id` — устаревшее имя
    # того же поля: фронт присылал его, когда тест создавал сам преподаватель.
    # Принимаем оба, пока старые клиенты не обновились.
    lecturer_id: Optional[int] = None
    user_id: Optional[int] = None
    group_id: Optional[int] = None
    subject_id: Optional[int] = None
    # Своей колонки у семестра нет — он нужен только как часть названия.
    semester_number: Optional[int] = Field(default=None, ge=1, le=2)
    is_active: bool = False
    proctoring_mode: ProctoringMode = "standard"
    quiz_type: QuizType = QuizType.LESSON_QUIZ

    @field_validator("pin", mode="before")
    @classmethod
    def must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Field cannot be empty")
        return v.strip()

    @field_validator("title", mode="before")
    @classmethod
    def blank_title_means_generate(cls, v: Optional[str]) -> Optional[str]:
        """Пустая строка от клиента — это «сгенерируй», а не пустое название."""
        if v is None:
            return None
        v = v.strip()
        return v or None

    @model_validator(mode="after")
    def unify_lecturer(self):
        """Сводит устаревшее `user_id` и новое `lecturer_id` в одно значение."""
        if self.lecturer_id is None and self.user_id is not None:
            self.lecturer_id = self.user_id
        elif self.user_id is None and self.lecturer_id is not None:
            self.user_id = self.lecturer_id
        return self


class QuizCreateResponse(BaseModel):
    id: int
    title: str
    question_number: int
    duration: int
    pin: str
    is_active: bool
    proctoring_mode: ProctoringMode
    quiz_type: QuizType
    attempt: Optional[int] = 1
    lecturer_id: Optional[int]
    created_by_user_id: Optional[int] = None
    group_id: Optional[int]
    subject_id: Optional[int]
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(
        from_attributes=True,
    )

    @computed_field
    @property
    def user_id(self) -> Optional[int]:
        """Устаревший алиас `lecturer_id` — на него ещё смотрят старые клиенты."""
        return self.lecturer_id


class QuizListRequest(BaseModel):
    title: Optional[str] = None
    # Фильтр по лектору. Имя параметра оставлено прежним: это query-параметр,
    # которым пользуются фронтовые фильтры и внешние ссылки.
    user_id: Optional[int] = None
    created_by_user_id: Optional[int] = None
    group_id: Optional[int] = None
    subject_id: Optional[int] = None
    faculty_id: Optional[int] = None
    is_active: Optional[bool] = None
    proctoring_mode: Optional[ProctoringMode] = None
    quiz_type: Optional[QuizType] = None

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


class AvailableQuestionsResponse(BaseModel):
    """Сколько вопросов лектора доступно для сборки теста.

    Возвращается только количество: организатор тестирования не должен видеть
    формулировки вопросов и варианты ответов.
    """

    lecturer_id: int
    subject_id: int
    available: int


class QuizCatalogSubject(BaseModel):
    subject_id: int
    subject_name: str
    quiz_count: int
    active_count: int


class QuizCatalogFaculty(BaseModel):
    faculty_id: int
    faculty_name: str
    quiz_count: int
    active_count: int
    subjects: list[QuizCatalogSubject]


class QuizCatalogResponse(BaseModel):
    faculties: list[QuizCatalogFaculty]


class QuizQuestionAnalytics(BaseModel):
    question_id: int
    question_text: str
    answer_count: int
    correct_count: int
    wrong_count: int
    correct_percent: float


class QuizAnalyticsResponse(BaseModel):
    quiz_id: int
    total_students: int
    submitted_count: int
    average_grade: Optional[float] = None
    minimum_grade: Optional[int] = None
    maximum_grade: Optional[int] = None
    average_duration_seconds: Optional[float] = None
    questions: list[QuizQuestionAnalytics]
