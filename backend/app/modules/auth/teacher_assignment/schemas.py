from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.schemas import MAX_PAGE_SIZE, TashkentDatetime


class TeacherAssignmentCreateRequest(BaseModel):
    teacher_id: int
    subject_id: int
    group_id: int


class TeacherInfo(BaseModel):
    id: int
    full_name: str

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="before")
    @classmethod
    def name_from_employee(cls, data: Any) -> Any:
        """ФИО у преподавателя лежит в его карточке сотрудника.

        После разделения Employee/Teacher у Teacher остались только kafedra_id и
        employee_id — full_name живёт в employees. Схема же продолжала требовать
        его прямо с Teacher, и весь эндпоинт отвечал пятисоткой, как только в
        teacher_assignments появлялась хоть одна строка.
        """
        if hasattr(data, "employee") and data.employee is not None:
            data.__dict__["full_name"] = data.employee.full_name
        return data


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
