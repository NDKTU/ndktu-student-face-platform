from typing import Optional

from app.core.schemas import TashkentDatetime
from pydantic import BaseModel, ConfigDict, field_validator, model_validator


class ResultUserInfo(BaseModel):
    id: int
    username: str
    model_config = ConfigDict(from_attributes=True)


class ResultQuizInfo(BaseModel):
    id: int
    title: str
    model_config = ConfigDict(from_attributes=True)


class ResultSubjectInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class ResultGroupInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class ResultResponse(BaseModel):
    id: int
    user_id: Optional[int]
    quiz_id: Optional[int]
    subject_id: Optional[int]
    group_id: Optional[int]
    status: str
    correct_answers: Optional[int] = None
    wrong_answers: Optional[int] = None
    grade: Optional[int] = None
    created_at: TashkentDatetime
    finished_at: Optional[TashkentDatetime] = None
    updated_at: TashkentDatetime

    user: Optional[ResultUserInfo] = None
    quiz: Optional[ResultQuizInfo] = None
    subject: Optional[ResultSubjectInfo] = None
    group: Optional[ResultGroupInfo] = None
    student_id: Optional[str] = None
    student_name: Optional[str] = None

    cheating_detected: bool = False
    cheating_image_url: Optional[str] = None

    @field_validator("cheating_detected", mode="before")
    @classmethod
    def coerce_cheating_bool(cls, v):
        if v is None:
            return False
        return bool(v)

    reason_for_stop: Optional[str] = None

    model_config = ConfigDict(
        from_attributes=True,
    )

    @model_validator(mode="before")
    @classmethod
    def extract_student_data(cls, data):
        if hasattr(data, "__dict__"):
            if "user" in data.__dict__ and data.user:
                user = data.user
                if hasattr(user, "__dict__") and "student" in user.__dict__ and user.student:
                    student = user.student
                    data.student_id = student.student_id_number
                    data.student_name = student.full_name
        return data


class ResultListRequest(BaseModel):
    user_id: Optional[int] = None
    quiz_id: Optional[int] = None
    subject_id: Optional[int] = None
    group_id: Optional[int] = None
    grade: Optional[int] = None
    username: Optional[str] = None

    page: int = 1
    limit: int = 10
    sort_dir: Optional[str] = "desc"

    @property
    def offset(self) -> int:
        if self.page < 1:
            return 0
        return (self.page - 1) * self.limit


class ResultListResponse(BaseModel):
    total: int
    page: int
    limit: int
    results: list[ResultResponse]
