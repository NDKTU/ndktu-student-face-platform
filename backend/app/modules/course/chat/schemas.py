from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from app.core.schemas import TashkentDatetime

#: Muallif kursda kim: o'qituvchi (asosiy yoki assistent), talaba yoki
#: boshqa xodim (admin). Chatda o'qituvchi xabari ajralib turishi uchun.
AUTHOR_ROLES = Literal["teacher", "student", "admin", "other"]

MESSAGE_MAX_LENGTH = 4000


class CourseMessageCreateRequest(BaseModel):
    body: str = Field(min_length=1, max_length=MESSAGE_MAX_LENGTH)

    @field_validator("body")
    @classmethod
    def not_blank(cls, value: str) -> str:
        # Faqat bo'sh joy va qator tashlashdan iborat xabar chatda bo'sh
        # pufak bo'lib ko'rinardi.
        value = value.strip()
        if not value:
            raise ValueError("Xabar bo'sh bo'lishi mumkin emas")
        return value


class CourseMessageListRequest(BaseModel):
    #: Shu id'dan oldingi (eskiroq) xabarlar — «oldingilarini yuklash».
    before_id: Optional[int] = None
    limit: int = Field(default=50, ge=1, le=100)


class CourseMessageResponse(BaseModel):
    id: int
    course_id: int
    user_id: Optional[int] = None
    author_name: str
    author_role: AUTHOR_ROLES
    body: str
    created_at: TashkentDatetime
    #: Muallifning o'zi yoki kurs o'qituvchisi/admin o'chira oladi.
    can_delete: bool = False


class CourseMessageListResponse(BaseModel):
    #: Eskidan yangiga tartibda.
    messages: List[CourseMessageResponse]
    #: Bundan eskiroq xabarlar ham bormi.
    has_more: bool
