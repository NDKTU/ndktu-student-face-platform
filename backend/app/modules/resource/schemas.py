from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict


class ResourceLink(BaseModel):
    """A single link entry inside a Resource."""

    title: str
    url: str

    model_config = ConfigDict(from_attributes=True)


FileType = Literal["image", "pdf", "docx", "xlsx", "pptx"]


class ResourceFile(BaseModel):
    name: str
    url: str
    type: FileType

    model_config = ConfigDict(from_attributes=True)


class ResourceSubjectTeacherInfo(BaseModel):
    id: int
    subject_id: int
    teacher_id: int
    model_config = ConfigDict(from_attributes=True)


class ResourceGroupInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class ResourceCreateRequest(BaseModel):
    subject_teacher_id: Optional[int] = None
    group_id: Optional[int] = None
    lesson_id: Optional[int] = None
    course_id: Optional[int] = None
    topic_id: Optional[int] = None
    main_text: str
    links: List[ResourceLink] = []
    files: List[ResourceFile] = []


class ResourceUpdateRequest(BaseModel):
    main_text: Optional[str] = None
    links: Optional[List[ResourceLink]] = None
    files: Optional[List[ResourceFile]] = None
    group_id: Optional[int] = None
    subject_teacher_id: Optional[int] = None
    lesson_id: Optional[int] = None
    course_id: Optional[int] = None
    topic_id: Optional[int] = None


class ResourceResponse(BaseModel):
    id: int
    subject_teacher_id: int
    group_id: Optional[int] = None
    lesson_id: Optional[int] = None
    course_id: Optional[int] = None
    topic_id: Optional[int] = None
    main_text: str
    links: List[ResourceLink]
    files: List[ResourceFile] = []
    created_at: datetime
    updated_at: datetime
    subject_teacher: Optional[ResourceSubjectTeacherInfo] = None
    group: Optional[ResourceGroupInfo] = None

    model_config = ConfigDict(from_attributes=True)


class ResourceListRequest(BaseModel):
    subject_teacher_id: Optional[int] = None
    group_id: Optional[int] = None
    lesson_id: Optional[int] = None
    course_id: Optional[int] = None
    topic_id: Optional[int] = None

    page: int = 1
    limit: int = 20

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
