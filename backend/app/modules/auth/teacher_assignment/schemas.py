from app.core.schemas import MAX_PAGE_SIZE, TashkentDatetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class TeacherAssignmentCreateRequest(BaseModel):
    teacher_id: int
    subject_id: int
    group_id: int


class TeacherInfo(BaseModel):
    id: int
    full_name: str
    model_config = ConfigDict(from_attributes=True)


class SubjectInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class GroupInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class TeacherAssignmentResponse(BaseModel):
    id: int
    teacher_id: int
    subject_id: int
    group_id: int
    teacher: Optional[TeacherInfo] = None
    subject: Optional[SubjectInfo] = None
    group: Optional[GroupInfo] = None
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(from_attributes=True)


class TeacherAssignmentListRequest(BaseModel):
    teacher_id: Optional[int] = None
    subject_id: Optional[int] = None
    group_id: Optional[int] = None
    page: int = 1
    limit: int = Field(default=20, ge=1, le=MAX_PAGE_SIZE)

    @property
    def offset(self) -> int:
        if self.page < 1:
            return 0
        return (self.page - 1) * self.limit


class TeacherAssignmentListResponse(BaseModel):
    total: int
    page: int
    limit: int
    assignments: List[TeacherAssignmentResponse]
