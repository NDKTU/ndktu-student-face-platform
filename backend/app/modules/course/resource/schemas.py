from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.schemas import TashkentDatetime

RESOURCE_TYPES = Literal["file", "link", "text", "video"]


class ResourceCreateRequest(BaseModel):
    lesson_id: Optional[int] = None
    course_id: Optional[int] = None
    resource_type: RESOURCE_TYPES
    title: str = Field(min_length=1, max_length=255)
    file_url: Optional[str] = None
    link_url: Optional[str] = None
    text_content: Optional[str] = None
    order_index: int = 0

    @model_validator(mode="after")
    def check_parent_and_content(self):
        if (self.lesson_id is None) == (self.course_id is None):
            raise ValueError("Exactly one of lesson_id or course_id must be set")

        # Видео принимается только ссылкой (YouTube): загрузка видеофайлов отключена.
        field_by_type = {
            "file": self.file_url,
            "link": self.link_url,
            "text": self.text_content,
            "video": self.link_url,
        }
        if not field_by_type[self.resource_type]:
            raise ValueError(f"{self.resource_type} resource requires the matching content field to be set")
        return self


class ResourceUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    file_url: Optional[str] = None
    link_url: Optional[str] = None
    text_content: Optional[str] = None
    order_index: Optional[int] = None


class ResourceLessonInfo(BaseModel):
    id: int
    topic: str
    model_config = ConfigDict(from_attributes=True)


class ResourceCourseInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class ResourceResponse(BaseModel):
    id: int
    lesson_id: Optional[int] = None
    course_id: Optional[int] = None
    resource_type: RESOURCE_TYPES
    title: str
    file_url: Optional[str] = None
    link_url: Optional[str] = None
    text_content: Optional[str] = None
    order_index: int
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    lesson: Optional[ResourceLessonInfo] = None
    course: Optional[ResourceCourseInfo] = None

    model_config = ConfigDict(from_attributes=True)


class ResourceListRequest(BaseModel):
    lesson_id: Optional[int] = None
    course_id: Optional[int] = None

    page: int = 1
    limit: int = 50

    @property
    def offset(self) -> int:
        if self.page < 1:
            return 0
        return (self.page - 1) * self.limit


class ResourceListResponse(BaseModel):
    total: int
    page: int
    limit: int
    resources: List[ResourceResponse]
