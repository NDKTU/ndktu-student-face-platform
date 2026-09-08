from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.schemas import TashkentDatetime

#: Mavzu (va uning ichidagi darslar) turi. `Lesson.lesson_type` dagi
#: ro'yxatning qismi: mustaqil ta'lim mavzu darajasida rejalashtirilmaydi.
TOPIC_TYPE_VALUES = Literal["lecture", "lab", "seminar"]

#: Mavzuning ko'rinadigan nomi turdan olinadi — o'qituvchi alohida sarlavha
#: yozmaydi. `title` ustuni saqlanadi: eski mavzularning qo'lda yozilgan
#: nomlari bor va ular yo'qolmasligi kerak.
TOPIC_TYPE_TITLES: dict[str, str] = {
    "lecture": "Ma'ruza",
    "lab": "Laboratoriya",
    "seminar": "Seminar",
}


class CourseTopicCreateRequest(BaseModel):
    course_id: int
    #: Majburiy: mavzu ichidagi darslar turini shundan oladi.
    topic_type: TOPIC_TYPE_VALUES
    #: Odatda yuborilmaydi — nom turdan olinadi.
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    order_index: Optional[int] = Field(default=None, ge=1)


class CourseTopicUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    topic_type: Optional[TOPIC_TYPE_VALUES] = None
    order_index: Optional[int] = Field(default=None, ge=1)


class CourseTopicResponse(BaseModel):
    id: int
    course_id: int
    title: str
    #: Eski mavzularda bo'sh bo'lishi mumkin.
    topic_type: Optional[str] = None
    order_index: int
    lesson_count: int = 0
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(from_attributes=True)


class CourseTopicListResponse(BaseModel):
    topics: list[CourseTopicResponse]
