from __future__ import annotations

from datetime import date
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.core.schemas import TashkentDatetime

QUESTION_TYPES = Literal["text", "true_false", "scale", "image_stimulus", "image_choice", "multi_choice"]


# ─── Question ────────────────────────────────────────────────────────────────


class QuestionResponse(BaseModel):
    id: int
    method_id: int
    question_type: str
    content: dict[str, Any]
    options: Optional[list[dict[str, Any]]] = None
    order: int
    category: Optional[str] = None
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(from_attributes=True)


class QuestionCreateRequest(BaseModel):
    method_id: int
    question_type: QUESTION_TYPES
    content: dict[str, Any]
    options: Optional[list[dict[str, Any]]] = None
    order: int = 0
    category: Optional[str] = None

    @field_validator("content", mode="before")
    @classmethod
    def validate_content(cls, v: Any, info: Any) -> Any:
        if not isinstance(v, dict):
            raise ValueError("content must be a dict")
        q_type = info.data.get("question_type") if hasattr(info, "data") else None
        if q_type in ("text", "true_false", "image_stimulus", "multi_choice"):
            if "text" not in v:
                raise ValueError(f"content.text is required for question_type='{q_type}'")
        if q_type == "scale":
            for key in ("text", "min", "max"):
                if key not in v:
                    raise ValueError(f"content.{key} is required for question_type='scale'")
        if q_type == "image_stimulus":
            if "image_url" not in v:
                raise ValueError("content.image_url is required for question_type='image_stimulus'")
        return v


class QuestionUpdateRequest(BaseModel):
    question_type: Optional[QUESTION_TYPES] = None
    content: Optional[dict[str, Any]] = None
    options: Optional[list[dict[str, Any]]] = None
    order: Optional[int] = None
    category: Optional[str] = None


# ─── Method ──────────────────────────────────────────────────────────────────


class MethodCreateRequest(BaseModel):
    name: str
    description: str
    instruction: dict[str, Any] = {}


class MethodUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    instruction: Optional[dict[str, Any]] = None


class MethodResponse(BaseModel):
    id: int
    name: str
    description: str
    instruction: dict[str, Any]
    created_at: TashkentDatetime
    updated_at: TashkentDatetime
    questions: list[QuestionResponse] = []

    model_config = ConfigDict(from_attributes=True)


class MethodListRequest(BaseModel):
    page: int = 1
    limit: int = 20

    @property
    def offset(self) -> int:
        return max(0, (self.page - 1) * self.limit)


class MethodListResponse(BaseModel):
    total: int
    page: int
    limit: int
    methods: list[MethodResponse]


# ─── Test / Result ────────────────────────────────────────────────────────────


class AnswerItem(BaseModel):
    question_id: int
    value: Any  # bool | int | float | str depending on question_type


class TestSubmitRequest(BaseModel):
    answers: list[AnswerItem]


class TestResultUserInfo(BaseModel):
    id: int
    username: str
    model_config = ConfigDict(from_attributes=True)


class TestResultResponse(BaseModel):
    id: int
    method_id: int
    user_id: Optional[int]
    answers: list[dict[str, Any]]
    diagnosis: Optional[dict[str, Any]] = None
    created_at: TashkentDatetime
    updated_at: TashkentDatetime
    method: Optional[MethodResponse] = None
    user: Optional[TestResultUserInfo] = None

    model_config = ConfigDict(from_attributes=True)


class TestResultListResponse(BaseModel):
    total: int
    page: int
    limit: int
    results: list[TestResultResponse]


class TestResultListRequest(BaseModel):
    method_id: Optional[int] = None
    user_id: Optional[int] = None
    faculty_id: Optional[int] = None
    group_id: Optional[int] = None
    page: int = 1
    limit: int = 20

    @property
    def offset(self) -> int:
        return max(0, (self.page - 1) * self.limit)


# ─── Statistics ──────────────────────────────────────────────────────────────


class StatsFilter(BaseModel):
    """Umumiy filtr: tashkiliy tuzilma + davr (Toshkent sanasi, ikkala chegara kiradi)."""

    faculty_id: Optional[int] = None
    group_id: Optional[int] = None
    course: Optional[int] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None


class MethodUsage(BaseModel):
    method_id: int
    name: str
    results: int
    students: int


class FacultyCoverage(BaseModel):
    faculty_id: int
    name: str
    total_students: int
    tested_students: int
    coverage_pct: float


class StatsOverviewResponse(BaseModel):
    total_results: int
    results_7d: int
    results_30d: int
    total_students: int
    tested_students: int
    coverage_pct: float
    methods: list[MethodUsage]
    faculties: list[FacultyCoverage]


class LevelCount(BaseModel):
    label: str
    count: int
    pct: float
    risk: bool = False


class ScoreCount(BaseModel):
    score: int
    count: int


class CategoryStats(BaseModel):
    name: str
    avg: Optional[float] = None
    min: Optional[int] = None
    max: Optional[int] = None
    levels: list[LevelCount]


class MethodStatsResponse(BaseModel):
    method_id: int
    name: str
    scoring: Optional[str] = None
    total: int
    undetermined: int
    levels: list[LevelCount] = []
    histogram: list[ScoreCount] = []
    avg: Optional[float] = None
    min: Optional[int] = None
    max: Optional[int] = None
    categories: list[CategoryStats] = []


BREAKDOWN_BY = Literal["faculty", "course", "group"]


class BreakdownRow(BaseModel):
    key: int
    name: str
    total: int
    avg: Optional[float] = None
    levels: dict[str, int]
    risk_count: int
    risk_pct: float


class MethodBreakdownResponse(BaseModel):
    by: str
    category: Optional[str] = None
    labels: list[str]
    risk_labels: list[str]
    rows: list[BreakdownRow]


class RiskStudent(BaseModel):
    result_id: int
    user_id: int
    username: Optional[str] = None
    full_name: Optional[str] = None
    student_id_number: Optional[str] = None
    group_name: Optional[str] = None
    faculty_name: Optional[str] = None
    course: Optional[int] = None
    category: Optional[str] = None
    label: str
    score: Optional[int] = None
    created_at: TashkentDatetime


class RiskListResponse(BaseModel):
    total: int
    risk_labels: list[str]
    items: list[RiskStudent]


TIMELINE_PERIOD = Literal["day", "week", "month"]


class TimelinePoint(BaseModel):
    bucket: date
    count: int


class TimelineResponse(BaseModel):
    period: str
    points: list[TimelinePoint]


class HistoryCategory(BaseModel):
    name: str
    score: int
    label: str


class HistoryItem(BaseModel):
    result_id: int
    method_id: int
    method_name: str
    created_at: TashkentDatetime
    label: Optional[str] = None
    score: Optional[int] = None
    categories: list[HistoryCategory] = []


class UserHistoryResponse(BaseModel):
    user_id: int
    full_name: Optional[str] = None
    username: Optional[str] = None
    items: list[HistoryItem]
