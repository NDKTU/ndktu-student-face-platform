from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.schemas import TashkentDatetime


class CourseTopicCreateRequest(BaseModel):
    course_id: int
    title: str = Field(min_length=1, max_length=255)
    order_index: Optional[int] = Field(default=None, ge=1)


class CourseTopicUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    order_index: Optional[int] = Field(default=None, ge=1)


class CourseTopicResponse(BaseModel):
    id: int
    course_id: int
    title: str
    order_index: int
    lesson_count: int = 0
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(from_attributes=True)


class CourseTopicListResponse(BaseModel):
    topics: list[CourseTopicResponse]
