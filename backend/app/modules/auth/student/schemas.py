from datetime import date

from app.core.schemas import MAX_PAGE_SIZE, TashkentDatetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class StudentBase(BaseModel):
    first_name: str
    last_name: str
    third_name: str
    full_name: str
    student_id_number: str
    image_path: str
    birth_date: date
    phone: Optional[str] = None
    gender: str
    university: str
    specialty: str
    student_status: str
    education_type: str
    payment_form: str
    education_lang: str
    faculty: str
    level: str
    semester: str
    address: str
    avg_gpa: float
    user_id: Optional[int] = None
    group_id: Optional[int] = None


class StudentCreateRequest(StudentBase):
    pass


class StudentUpdateRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    third_name: Optional[str] = None
    full_name: Optional[str] = None
    student_id_number: Optional[str] = None
    image_path: Optional[str] = None
    birth_date: Optional[date] = None
    phone: Optional[str] = None
    gender: Optional[str] = None
    university: Optional[str] = None
    specialty: Optional[str] = None
    student_status: Optional[str] = None
    education_type: Optional[str] = None
    payment_form: Optional[str] = None
    education_lang: Optional[str] = None
    faculty: Optional[str] = None
    level: Optional[str] = None
    semester: Optional[str] = None
    address: Optional[str] = None
    avg_gpa: Optional[float] = None
    user_id: Optional[int] = None
    group_id: Optional[int] = None


class StudentGroupInfo(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class StudentUserInfo(BaseModel):
    id: int
    username: str

    model_config = ConfigDict(from_attributes=True)


class StudentResponse(StudentBase):
    id: int
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    # Реестр студентов показывает группу и логин. group_id и user_id сами по
    # себе бесполезны: разрешать их в названия на клиенте — это лишний запрос
    # на каждую из полутора тысяч строк.
    group: Optional[StudentGroupInfo] = None
    user: Optional[StudentUserInfo] = None

    model_config = ConfigDict(from_attributes=True)


class StudentListRequest(BaseModel):
    page: int = 1
    limit: int = Field(default=10, ge=1, le=MAX_PAGE_SIZE)
    search: str | None = None
    user_id: int | None = None
    group_id: int | None = None

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.limit


class StudentListResponse(BaseModel):
    total: int
    page: int
    limit: int
    students: list[StudentResponse]


class UserInfoResponse(BaseModel):
    id: int
    username: str
    is_active: bool
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(from_attributes=True)


class StudentWithUserResponse(BaseModel):
    student_id: int
    user_id: Optional[int]
    username: Optional[str]
    is_active: Optional[bool]
    first_name: str
    last_name: str
    full_name: str
    student_id_number: str
    phone: Optional[str]
    gender: str
    faculty: str
    level: str
    semester: str
    specialty: str
    student_status: str
    avg_gpa: float
    group_id: Optional[int]
    created_at: TashkentDatetime
    updated_at: TashkentDatetime


class StudentWithUserListResponse(BaseModel):
    total: int
    page: int
    limit: int
    students: list[StudentWithUserResponse]


class StudentSensitiveResponse(BaseModel):
    """Персональные данные студента.

    Живут в отдельной схеме, а не в StudentResponse, намеренно: списочный
    эндпоинт отдаёт сотни строк разом, и одно лишнее поле здесь означало бы
    выгрузку ЖШШИР всего курса одним запросом.
    """

    id: int
    jshshir: Optional[str] = None
    passport: Optional[str] = None
    region: Optional[str] = None
    district: Optional[str] = None
    address: Optional[str] = None
    social_category: Optional[str] = None
    benefit: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
