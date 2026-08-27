from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.schemas import TashkentDatetime

SUBMISSION_STATUS = Literal["draft", "submitted", "late", "graded", "returned"]


class SubmissionFile(BaseModel):
    name: str
    url: str
    size: Optional[int] = None
    type: Optional[str] = None


class HomeworkCreateRequest(BaseModel):
    course_id: int
    lesson_id: Optional[int] = None
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    deadline: datetime
    max_grade: int = Field(default=100, ge=1, le=1000)
    allow_file: bool = True
    allow_text: bool = True
    allowed_file_types: List[str] = []
    attachments: List[SubmissionFile] = []


class HomeworkUpdateRequest(BaseModel):
    lesson_id: Optional[int] = None
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    deadline: Optional[datetime] = None
    max_grade: Optional[int] = Field(default=None, ge=1, le=1000)
    allow_file: Optional[bool] = None
    allow_text: Optional[bool] = None
    allowed_file_types: Optional[List[str]] = None
    attachments: Optional[List[SubmissionFile]] = None


class HomeworkStats(BaseModel):
    total_students: int
    submitted: int
    graded: int
    late: int


class HomeworkResponse(BaseModel):
    id: int
    course_id: int
    lesson_id: Optional[int] = None
    created_by_user_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    deadline: TashkentDatetime
    max_grade: int
    allow_file: bool
    allow_text: bool
    allowed_file_types: List[str] = []
    attachments: List[SubmissionFile] = []
    stats: Optional[HomeworkStats] = None
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(from_attributes=True)


class HomeworkListRequest(BaseModel):
    course_id: Optional[int] = None
    lesson_id: Optional[int] = None
    page: int = 1
    limit: int = 50

    @property
    def offset(self) -> int:
        if self.page < 1:
            return 0
        return (self.page - 1) * self.limit


class HomeworkListResponse(BaseModel):
    total: int
    page: int
    limit: int
    homeworks: List[HomeworkResponse]


# ── Submissions ───────────────────────────────────────────────────────────


class SubmissionUserInfo(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class SubmissionSubmitRequest(BaseModel):
    submitted_text: Optional[str] = None
    submitted_files: List[SubmissionFile] = []


class SubmissionGradeRequest(BaseModel):
    grade: int = Field(ge=0, le=1000)
    feedback: Optional[str] = None


class SubmissionResponse(BaseModel):
    id: int
    homework_id: int
    user_id: int
    submitted_text: Optional[str] = None
    submitted_files: List[SubmissionFile] = []
    submitted_at: Optional[TashkentDatetime] = None
    status: str
    grade: Optional[int] = None
    feedback: Optional[str] = None
    graded_at: Optional[TashkentDatetime] = None
    user: Optional[SubmissionUserInfo] = None
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(from_attributes=True)


class SubmissionListResponse(BaseModel):
    submissions: List[SubmissionResponse]
