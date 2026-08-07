from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

VIDEO_TYPES = Literal["upload", "youtube"]


class MaterialAttachment(BaseModel):
    name: str
    url: str
    size: Optional[int] = None


class MaterialResponse(BaseModel):
    id: int
    topic_id: int
    title: str
    description: Optional[str] = None
    video_type: Optional[VIDEO_TYPES] = None
    video_url: Optional[str] = None
    poster_url: Optional[str] = None
    duration_label: Optional[str] = None
    attachments: List[MaterialAttachment] = []
    position: int
    # Прошёл ли материал тот, кто спрашивает. У преподавателя всегда false:
    # отметка принадлежит студенту, а не курсу.
    completed: bool = False

    model_config = ConfigDict(from_attributes=True)


class MaterialCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: Optional[str] = None
    video_type: Optional[VIDEO_TYPES] = None
    video_url: Optional[str] = None
    poster_url: Optional[str] = None
    duration_label: Optional[str] = None
    attachments: List[MaterialAttachment] = []


class MaterialUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=300)
    description: Optional[str] = None
    video_type: Optional[VIDEO_TYPES] = None
    video_url: Optional[str] = None
    poster_url: Optional[str] = None
    duration_label: Optional[str] = None
    attachments: Optional[List[MaterialAttachment]] = None
    position: Optional[int] = None


class TopicResponse(BaseModel):
    id: int
    course_id: int
    title: str
    position: int
    materials: List[MaterialResponse] = []

    model_config = ConfigDict(from_attributes=True)


class TopicCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=300)


class TopicUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=300)
    position: Optional[int] = None


class CourseContentResponse(BaseModel):
    course_id: int
    topics: List[TopicResponse]
    # Счётчики прогресса спрашивающего: карточка курса показывает «пройдено N из M».
    total_materials: int
    completed_materials: int


class ReorderRequest(BaseModel):
    """Новый порядок целиком: список id в нужной последовательности."""

    ids: List[int]
