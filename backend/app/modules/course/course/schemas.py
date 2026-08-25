from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.schemas import TashkentDatetime


class CourseSubjectInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class CourseTeacherInfo(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class CourseGroupInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class CourseFacultyInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class CourseKafedraInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class CourseSpecialityInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class CourseCreateRequest(BaseModel):
    # Название собирается на сервере из предмета, групп и семестра. Поле осталось
    # необязательным ради старых клиентов: присланное имя имеет приоритет.
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    subject_id: int
    teacher_id: int
    description: Optional[str] = None
    semester_number: Optional[int] = Field(default=None, ge=1, le=2)
    group_ids: List[int] = Field(default_factory=list)
    faculty_id: Optional[int] = None
    kafedra_id: Optional[int] = None
    speciality_id: Optional[int] = None


class CourseUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    subject_id: Optional[int] = None
    teacher_id: Optional[int] = None
    description: Optional[str] = None
    semester_number: Optional[int] = Field(default=None, ge=1, le=2)
    group_ids: Optional[List[int]] = None
    faculty_id: Optional[int] = None
    kafedra_id: Optional[int] = None
    speciality_id: Optional[int] = None


class CourseResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    subject_id: int
    teacher_id: int
    semester_number: Optional[int] = None
    faculty_id: Optional[int] = None
    kafedra_id: Optional[int] = None
    speciality_id: Optional[int] = None
    subject: Optional[CourseSubjectInfo] = None
    teacher: Optional[CourseTeacherInfo] = None
    faculty: Optional[CourseFacultyInfo] = None
    kafedra: Optional[CourseKafedraInfo] = None
    speciality: Optional[CourseSpecialityInfo] = None
    groups: List[CourseGroupInfo] = []
    topic_count: int = 0
    lesson_count: int = 0
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(from_attributes=True)


class CourseListRequest(BaseModel):
    teacher_id: Optional[int] = None
    subject_id: Optional[int] = None
    group_id: Optional[int] = None
    semester_number: Optional[int] = None
    faculty_id: Optional[int] = None
    kafedra_id: Optional[int] = None
    speciality_id: Optional[int] = None
    page: int = 1
    limit: int = 20

    @property
    def offset(self) -> int:
        if self.page < 1:
            return 0
        return (self.page - 1) * self.limit


class CourseListResponse(BaseModel):
    total: int
    page: int
    limit: int
    courses: List[CourseResponse]


class CourseTeacherSummary(BaseModel):
    teacher_id: int
    username: str
    full_name: Optional[str] = None
    kafedra_id: Optional[int] = None
    kafedra_name: Optional[str] = None
    course_count: int
    lesson_count: int


class CourseTeacherSummaryResponse(BaseModel):
    teachers: List[CourseTeacherSummary]
