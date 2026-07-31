from datetime import date as date_type

from app.core.schemas import MAX_PAGE_SIZE, TashkentDatetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

ATTENDANCE_VALUES = Literal["present", "absent", "late"]
LESSON_TYPE_VALUES = Literal["lecture", "seminar", "independent", "lab"]


class LessonSubjectInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class LessonSubjectTeacherInfo(BaseModel):
    id: int
    subject_id: int
    teacher_id: int
    subject: Optional[LessonSubjectInfo] = None
    model_config = ConfigDict(from_attributes=True)


class LessonGroupInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class LessonCreateRequest(BaseModel):
    subject_teacher_id: Optional[int] = None
    group_id: int
    course_id: int
    lesson_type: Optional[LESSON_TYPE_VALUES] = None
    topic: str = Field(min_length=1, max_length=255)
    date: date_type
    description: Optional[str] = None


class LessonUpdateRequest(BaseModel):
    subject_teacher_id: Optional[int] = None
    group_id: Optional[int] = None
    course_id: Optional[int] = None
    lesson_type: Optional[LESSON_TYPE_VALUES] = None
    topic: Optional[str] = Field(default=None, min_length=1, max_length=255)
    date: Optional[date_type] = None
    description: Optional[str] = None


class LessonResponse(BaseModel):
    id: int
    subject_teacher_id: int
    group_id: int
    course_id: int
    lesson_type: Optional[str] = None
    topic: str
    date: date_type
    description: Optional[str] = None
    created_at: TashkentDatetime
    updated_at: TashkentDatetime
    subject_teacher: Optional[LessonSubjectTeacherInfo] = None
    group: Optional[LessonGroupInfo] = None

    model_config = ConfigDict(from_attributes=True)


class LessonListRequest(BaseModel):
    subject_teacher_id: Optional[int] = None
    group_id: Optional[int] = None
    course_id: Optional[int] = None
    date_from: Optional[date_type] = None
    date_to: Optional[date_type] = None
    page: int = 1
    limit: int = Field(default=20, ge=1, le=MAX_PAGE_SIZE)

    @property
    def offset(self) -> int:
        if self.page < 1:
            return 0
        return (self.page - 1) * self.limit


class LessonListResponse(BaseModel):
    total: int
    page: int
    limit: int
    lessons: List[LessonResponse]


# ── Lesson results ──────────────────────────────────────────────────────────


class LessonResultUserInfo(BaseModel):
    id: int
    username: str
    # Журнал подписывает строки ФИО, а не логином.
    full_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class LessonResultUpsertItem(BaseModel):
    user_id: int
    attendance: ATTENDANCE_VALUES
    grade: Optional[int] = Field(default=None, ge=0, le=5)
    notes: Optional[str] = None


class LessonResultsBulkUpsertRequest(BaseModel):
    items: List[LessonResultUpsertItem]


class LessonResultResponse(BaseModel):
    # None у строк, которые ещё не сохранены: журнал показывает всю группу, а
    # не только тех, кому уже поставили отметку.
    id: Optional[int] = None
    lesson_id: int
    user_id: int
    attendance: Optional[str] = None
    grade: Optional[int] = None
    notes: Optional[str] = None
    created_at: Optional[TashkentDatetime] = None
    updated_at: Optional[TashkentDatetime] = None
    user: Optional[LessonResultUserInfo] = None

    model_config = ConfigDict(from_attributes=True)


class LessonResultListResponse(BaseModel):
    total: int
    results: List[LessonResultResponse]
