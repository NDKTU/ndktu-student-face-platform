from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.schemas import MAX_PAGE_SIZE, TashkentDatetime

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
    limit: int = Field(default=20, ge=1, le=MAX_PAGE_SIZE)

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
    limit: int = Field(default=20, ge=1, le=MAX_PAGE_SIZE)

    @property
    def offset(self) -> int:
        return max(0, (self.page - 1) * self.limit)
