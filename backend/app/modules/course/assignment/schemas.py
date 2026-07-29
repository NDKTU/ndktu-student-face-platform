from datetime import datetime

from app.core.schemas import TashkentDatetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

SUBMISSION_STATUS = Literal["draft", "submitted", "late", "graded", "returned"]


class SubmissionFile(BaseModel):
    name: str
    url: str
    size: Optional[int] = None
    type: Optional[str] = None


class AssignmentCreateRequest(BaseModel):
    course_id: int
    lesson_id: Optional[int] = None
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    deadline: datetime
    max_grade: int = Field(default=100, ge=1, le=1000)
    allow_file: bool = True
    allow_text: bool = True
    allowed_file_types: List[str] = []


class AssignmentUpdateRequest(BaseModel):
    lesson_id: Optional[int] = None
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    deadline: Optional[datetime] = None
    max_grade: Optional[int] = Field(default=None, ge=1, le=1000)
    allow_file: Optional[bool] = None
    allow_text: Optional[bool] = None
    allowed_file_types: Optional[List[str]] = None


class AssignmentCourseInfo(BaseModel):
    """Контекст задания: без него в списке нечего показать, кроме заголовка.

    Экран заданий выводит фан, группу и преподавателя — всё это лежит на курсе,
    а разрешать course_id на клиенте значило бы запрос на каждую строку.
    """

    id: int
    name: str
    subject_name: Optional[str] = None
    teacher_name: Optional[str] = None
    faculty_name: Optional[str] = None
    group_names: List[str] = []


class AssignmentStats(BaseModel):
    total_students: int
    submitted: int
    graded: int
    late: int


class AssignmentResponse(BaseModel):
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
    course: Optional[AssignmentCourseInfo] = None
    stats: Optional[AssignmentStats] = None
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(from_attributes=True)


class AssignmentListRequest(BaseModel):
    course_id: Optional[int] = None
    lesson_id: Optional[int] = None
    page: int = 1
    limit: int = 50

    @property
    def offset(self) -> int:
        if self.page < 1:
            return 0
        return (self.page - 1) * self.limit


class AssignmentListResponse(BaseModel):
    total: int
    page: int
    limit: int
    assignments: List[AssignmentResponse]


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
    assignment_id: int
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


class PendingSubmission(BaseModel):
    """Работа, ждущая проверки, вместе с контекстом задания.

    Плоская строка: домашней странице преподавателя нужен список «что
    проверить», а не задания со вложенными сдачами.
    """

    id: int
    assignment_id: int
    assignment_title: str
    user_id: int
    full_name: str
    subject_name: Optional[str] = None
    group_names: List[str] = []
    submitted_at: Optional[TashkentDatetime] = None


class PendingSubmissionListResponse(BaseModel):
    total: int
    submissions: List[PendingSubmission]
