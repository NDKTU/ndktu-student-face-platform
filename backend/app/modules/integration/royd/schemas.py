from typing import Optional

from pydantic import BaseModel, Field


class RequestCreateRequest(BaseModel):
    """Talaba yuboradigan ariza.

    Talabaning o'zi haqidagi maydonlar (`student_hemis_id`, `full_name`,
    `faculty`, `group`) bu yerda yo'q: ularni server o'z bazasidan oladi.
    Mijozdan qabul qilsak, boshqa talaba nomidan ariza yuborish mumkin
    bo'lardi.

    `assigned_to` ham yo'q: mas'ul xodimni ROYD talabaning fakulteti
    bo'yicha o'zi tanlaydi.
    """

    category_id: int
    service_type_id: Optional[int] = None
    title: str = Field(min_length=3, max_length=500)
    description: str = Field(min_length=3, max_length=10000)


class MessageCreateRequest(BaseModel):
    content: str = Field(min_length=1)


class ResubmitRequest(BaseModel):
    """Qaytarilgan arizani to'ldirib qayta yuborish."""

    comment: str = Field(min_length=1)
