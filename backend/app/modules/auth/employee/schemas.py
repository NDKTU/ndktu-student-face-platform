from datetime import date

from app.core.schemas import MAX_PAGE_SIZE, TashkentDatetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


# Дубль GENDERS из app/core/database/enums.py: там ENUM базы, здесь проверка
# на входе. Менять нужно оба места разом — Literal нельзя собрать из кортежа.
Gender = Literal["Erkak", "Ayol"]

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


class EmployeeDepartmentInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class EmployeeJobTitleInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class EmployeeCreateRequest(BaseModel):
    username: str
    password: str
    first_name: str
    last_name: str
    third_name: str
    phone_number: Optional[str] = None
    image_url: Optional[str] = None
    department_id: Optional[int] = None
    roles: list[RoleRequest] = []
    # Служебная карточка: её показывает реестр «Xodimlar». Всё необязательно —
    # сотрудника заводят по ФИО и учётке, остальное дозаполняют позже.
    job_title_id: Optional[int] = None
    work_email: Optional[str] = None
    work_phone: Optional[str] = None
    gender: Optional[Gender] = None
    birth_date: Optional[date] = None
    hire_date: Optional[date] = None
    # Персональные данные. Принимаем на запись здесь, но наружу отдаём только
    # через /employee/{id}/sensitive — в EmployeeResponse их нет.
    jshshir: Optional[str] = None
    passport: Optional[str] = None
    personal_phone: Optional[str] = None
    address: Optional[str] = None

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
    department_id: Optional[int] = None
    # Служебная карточка: её показывает реестр «Xodimlar». Всё необязательно —
    # сотрудника заводят по ФИО и учётке, остальное дозаполняют позже.
    job_title_id: Optional[int] = None
    work_email: Optional[str] = None
    work_phone: Optional[str] = None
    gender: Optional[Gender] = None
    birth_date: Optional[date] = None
    hire_date: Optional[date] = None
    # Персональные данные. Принимаем на запись здесь, но наружу отдаём только
    # через /employee/{id}/sensitive — в EmployeeResponse их нет.
    jshshir: Optional[str] = None
    passport: Optional[str] = None
    personal_phone: Optional[str] = None
    address: Optional[str] = None

    @field_validator("first_name", "last_name", "third_name", mode="before")
    @classmethod
    def must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Field cannot be empty")
        return v.strip()


class EmployeeResponse(BaseModel):
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

    job_title_id: Optional[int] = None
    work_email: Optional[str] = None
    work_phone: Optional[str] = None
    gender: Optional[Gender] = None
    birth_date: Optional[date] = None
    hire_date: Optional[date] = None

    user: Optional[EmployeeUserInfo] = None
    teacher: Optional[EmployeeTeacherInfo] = None
    department: Optional[EmployeeDepartmentInfo] = None
    job_title: Optional[EmployeeJobTitleInfo] = None

    model_config = ConfigDict(from_attributes=True)


class EmployeeListRequest(BaseModel):
    full_name: Optional[str] = None
    # Сотрудники с указанной ролью (сравнение без учёта регистра): роли заводит
    # администратор руками, и «Dekan» с «dekan» — одно и то же.
    role: Optional[str] = None
    # Кто ещё не занимает структурную должность. Один человек — один пост:
    # декан факультета не может быть заодно заведующим кафедрой.
    available_post: Optional[Literal["dekan", "kafedra_mudiri"]] = None

    page: int = 1
    limit: int = Field(default=10, ge=1, le=MAX_PAGE_SIZE)

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


class EmployeeSensitiveResponse(BaseModel):
    """Персональные данные сотрудника — по тем же правилам, что у студента,
    но под своим правом: они выдаются независимо друг от друга."""

    id: int
    jshshir: Optional[str] = None
    passport: Optional[str] = None
    personal_phone: Optional[str] = None
    address: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
