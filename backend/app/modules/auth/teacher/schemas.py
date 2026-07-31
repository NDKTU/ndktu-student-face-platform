from app.core.schemas import MAX_PAGE_SIZE, TashkentDatetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class TeacherKafedraInfo(BaseModel):
    id: int
    name: str
    faculty_id: Optional[int] = None
    model_config = ConfigDict(from_attributes=True)


class TeacherGroupInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class TeacherUserGroupTeacherInfo(BaseModel):
    group_id: int
    group: TeacherGroupInfo
    model_config = ConfigDict(from_attributes=True)


class TeacherSubjectInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class TeacherSubjectTeacherInfo(BaseModel):
    id: int
    subject_id: int
    subject: TeacherSubjectInfo
    model_config = ConfigDict(from_attributes=True)


class TeacherEmployeeUserInfo(BaseModel):
    id: int
    username: str
    group_teachers: list[TeacherUserGroupTeacherInfo] = []
    model_config = ConfigDict(from_attributes=True)


class TeacherEmployeeInfo(BaseModel):
    id: int
    user_id: int
    first_name: str
    last_name: str
    third_name: str
    full_name: str
    phone_number: Optional[str] = None
    image_url: Optional[str] = None
    user: Optional[TeacherEmployeeUserInfo] = None
    model_config = ConfigDict(from_attributes=True)


class TeacherCreateRequest(BaseModel):
    employee_id: int
    kafedra_id: int


class TeacherUpdateRequest(BaseModel):
    """Teacher's own identity (employee_id) is immutable after creation —
    only the kafedra assignment can change. Personal info lives on Employee
    and is edited via the employee endpoints."""

    kafedra_id: int


class TeacherCreateResponse(BaseModel):
    id: int
    employee_id: int
    kafedra_id: int
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    kafedra: Optional[TeacherKafedraInfo] = None
    employee: Optional[TeacherEmployeeInfo] = None
    subject_teachers: list[TeacherSubjectTeacherInfo] = []

    model_config = ConfigDict(
        from_attributes=True,
    )


class TeacherListRequest(BaseModel):
    full_name: Optional[str] = None
    kafedra_id: Optional[int] = None

    page: int = 1

    limit: int = Field(default=10, ge=1, le=MAX_PAGE_SIZE)

    @property
    def offset(self) -> int:
        if self.page < 1:
            return 0
        return (self.page - 1) * self.limit


class TeacherListResponse(BaseModel):
    total: int
    page: int
    limit: int
    teachers: list[TeacherCreateResponse]


class TeacherGroupAssignRequest(BaseModel):
    user_id: int
    group_ids: list[int]


class TeacherSubjectAssignRequest(BaseModel):
    teacher_id: int
    subject_ids: list[int]


def _flatten_employee(data: Any) -> Any:
    """Shared before-validator: copies personal/user fields from
    `teacher.employee.*` onto the flat response shape these "my profile"
    endpoints have always returned."""
    if hasattr(data, "employee") and data.employee is not None:
        employee = data.employee
        data.__dict__["user_id"] = employee.user_id
        data.__dict__["first_name"] = employee.first_name
        data.__dict__["last_name"] = employee.last_name
        data.__dict__["third_name"] = employee.third_name
        data.__dict__["full_name"] = employee.full_name
    return data


class TeacherAssignedSubjectsResponse(BaseModel):
    id: int
    user_id: int
    first_name: str
    last_name: str
    third_name: str
    full_name: str
    subject_teachers: list[TeacherSubjectTeacherInfo]

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def flatten_employee(cls, data: Any) -> Any:
        return _flatten_employee(data)


class TeacherAssignedGroupsResponse(BaseModel):
    id: int
    user_id: int
    first_name: str
    last_name: str
    third_name: str
    full_name: str
    group_teachers: list[TeacherUserGroupTeacherInfo] = []

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def extract_group_teachers(cls, data: Any) -> Any:
        data = _flatten_employee(data)
        # Groups live on teacher.employee.user.group_teachers
        if hasattr(data, "employee") and data.employee is not None and data.employee.user is not None:
            data.__dict__["group_teachers"] = data.employee.user.group_teachers
        return data


# ── Teacher ranking schemas ───────────────────────────────────────────────────


class TeacherRankItem(BaseModel):
    """A single teacher entry in a ranking list."""

    rank: int
    teacher_id: int
    full_name: str
    kafedra_id: Optional[int] = None
    kafedra_name: Optional[str] = None
    faculty_id: Optional[int] = None
    faculty_name: Optional[str] = None
    # Present only when scope == "group"
    group_id: Optional[int] = None
    group_name: Optional[str] = None
    student_count: int
    avg_grade: float  # plain AVG(grade) on 2–5 scale
    weighted_rating: float  # Bayesian-adjusted rating, also 2–5

    model_config = ConfigDict(from_attributes=True)


class TeacherRankingResponse(BaseModel):
    total: int
    page: int = 1
    limit: int = Field(default=10, ge=1, le=MAX_PAGE_SIZE)
    teachers: list[TeacherRankItem]
    # active filters (None = no filter applied)
    faculty_id: Optional[int] = None
    kafedra_id: Optional[int] = None
    group_id: Optional[int] = None
    search: Optional[str] = None


# ── Faculty ranking schemas ───────────────────────────────────────────────────


class FacultyRankItem(BaseModel):
    """A single faculty entry in a faculty ranking list."""

    rank: int
    faculty_id: int
    faculty_name: str
    kafedra_count: int
    student_count: int
    avg_grade: float
    weighted_rating: float

    model_config = ConfigDict(from_attributes=True)


class FacultyRankingResponse(BaseModel):
    total: int
    page: int = 1
    limit: int = Field(default=10, ge=1, le=MAX_PAGE_SIZE)
    faculties: list[FacultyRankItem]


# ── Kafedra ranking schemas ───────────────────────────────────────────────────


class KafedraRankItem(BaseModel):
    """A single kafedra (chair) entry in a kafedra ranking list."""

    rank: int
    kafedra_id: int
    kafedra_name: str
    faculty_id: int
    faculty_name: str
    teacher_count: int
    student_count: int
    avg_grade: float
    weighted_rating: float

    model_config = ConfigDict(from_attributes=True)


class KafedraRankingResponse(BaseModel):
    total: int
    page: int = 1
    limit: int = Field(default=10, ge=1, le=MAX_PAGE_SIZE)
    kafedras: list[KafedraRankItem]
