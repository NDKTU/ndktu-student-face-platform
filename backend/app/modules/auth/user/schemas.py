from pydantic import BaseModel, ConfigDict, field_validator

from app.core.schemas import TashkentDatetime


class RoleResponse(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class PermissionInfo(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class RoleWithPermissionsResponse(BaseModel):
    id: int
    name: str
    permissions: list[PermissionInfo] = []

    model_config = ConfigDict(from_attributes=True)


class RoleRequest(BaseModel):
    name: str


class UserCreateRequest(BaseModel):
    username: str
    password: str
    roles: list[RoleRequest]

    @field_validator("username", mode="before")
    def validate_username(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Username cannot be empty")
        return value.strip().lower()

    @field_validator("password", mode="before")
    def validate_password(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Password cannot be empty")
        return value.strip()


class UserUpdateRequest(BaseModel):
    username: str | None = None
    password: str | None = None

    @field_validator("password", mode="before")
    def validate_password(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if not value.strip():
            raise ValueError("Password cannot be empty")
        return value.strip()


class UserChangeCredentialsRequest(BaseModel):
    """Used by any authenticated user to change their own credentials."""

    current_password: str
    new_username: str | None = None
    new_password: str | None = None

    @field_validator("new_username", mode="before")
    def validate_new_username(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if not value.strip():
            raise ValueError("Username cannot be empty")
        return value.strip().lower()

    @field_validator("new_password", mode="before")
    def validate_new_password(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if not value.strip():
            raise ValueError("New password cannot be empty")
        if len(value.strip()) < 4:
            raise ValueError("New password must be at least 4 characters")
        return value.strip()


class UserRoleAssignRequest(BaseModel):
    user_id: int
    role_ids: list[int]


class UserCreateResponse(BaseModel):
    id: int
    username: str
    # Foydalanuvchi o'zi yuklagan profil surati (`/uploads/profile/...`).
    avatar_path: str | None = None
    roles: list[RoleResponse]
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(from_attributes=True)


class UserListRequest(BaseModel):
    page: int = 1
    limit: int = 10
    username: str | None = None

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.limit


class KafedraResponse(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class TeacherDetailResponse(BaseModel):
    id: int
    first_name: str
    last_name: str
    third_name: str
    full_name: str
    image_url: str | None = None
    kafedra: KafedraResponse | None = None
    model_config = ConfigDict(from_attributes=True)


class GroupResponse(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class StudentDetailResponse(BaseModel):
    id: int
    first_name: str
    last_name: str
    third_name: str
    full_name: str
    image_path: str | None = None
    group: GroupResponse | None = None
    university: str | None = None
    specialty: str | None = None
    education_form: str | None = None
    education_type: str | None = None
    payment_form: str | None = None
    education_lang: str | None = None
    faculty: str | None = None
    level: str | None = None
    semester: str | None = None
    address: str | None = None
    avg_gpa: float | None = None
    model_config = ConfigDict(from_attributes=True)


class UserDetailResponse(UserCreateResponse):
    teacher: TeacherDetailResponse | None = None
    student: StudentDetailResponse | None = None


class UserMeResponse(BaseModel):
    id: int
    username: str
    avatar_path: str | None = None
    # `eduplan` / `hemis` — hisob tashqi tizimdan, parol shu yerda
    # o'zgartirilmaydi. Bo'sh — mahalliy hisob.
    auth_source: str | None = None
    roles: list[RoleWithPermissionsResponse]
    teacher: TeacherDetailResponse | None = None
    student: StudentDetailResponse | None = None
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(from_attributes=True)


class UserListResponse(BaseModel):
    total: int
    page: int
    limit: int
    users: list[UserDetailResponse]


class UserLoginRequest(BaseModel):
    username: str
    password: str

    @field_validator("username", mode="before")
    def validate_username(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Username cannot be empty")
        return value.strip().lower()

    @field_validator("password", mode="before")
    def validate_password(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Password cannot be empty")
        return value.strip()


class UserLoginResponse(BaseModel):
    type: str = "Bearer"
    access_token: str
