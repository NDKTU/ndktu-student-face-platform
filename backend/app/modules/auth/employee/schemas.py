from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.core.schemas import ExternalRefFields, TashkentDatetime
from app.modules.auth.user.schemas import RoleRequest, RoleResponse


class EmployeeUserInfo(BaseModel):
    id: int
    username: str
    roles: list[RoleResponse] = []
    model_config = ConfigDict(from_attributes=True)


class EmployeeTeacherInfo(BaseModel):
    id: int
    kafedra_id: int
    model_config = ConfigDict(from_attributes=True)


class EmployeeCreateRequest(BaseModel):
    username: str
    password: str
    first_name: str
    last_name: str
    third_name: str
    phone_number: Optional[str] = None
    image_url: Optional[str] = None
    roles: list[RoleRequest] = []

    @field_validator("first_name", "last_name", "third_name", mode="before")
    @classmethod
    def must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Field cannot be empty")
        return v.strip()

    @field_validator("username", mode="before")
    @classmethod
    def validate_username(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Username cannot be empty")
        return value.strip().lower()

    @field_validator("password", mode="before")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Password cannot be empty")
        return value.strip()


class EmployeeUpdateRequest(BaseModel):
    first_name: str
    last_name: str
    third_name: str
    phone_number: Optional[str] = None
    image_url: Optional[str] = None

    @field_validator("first_name", "last_name", "third_name", mode="before")
    @classmethod
    def must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Field cannot be empty")
        return v.strip()


class EmployeeResponse(ExternalRefFields):
    id: int
    user_id: int
    first_name: str
    last_name: str
    third_name: str
    full_name: str
    phone_number: Optional[str] = None
    image_url: Optional[str] = None
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    user: Optional[EmployeeUserInfo] = None
    teacher: Optional[EmployeeTeacherInfo] = None

    model_config = ConfigDict(from_attributes=True)


class EmployeeListRequest(BaseModel):
    full_name: Optional[str] = None

    page: int = 1
    limit: int = 10

    @property
    def offset(self) -> int:
        if self.page < 1:
            return 0
        return (self.page - 1) * self.limit


class EmployeeListResponse(BaseModel):
    total: int
    page: int
    limit: int
    employees: list[EmployeeResponse]
