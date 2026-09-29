from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    user_id: Optional[int] = None
    username: Optional[str] = None
    #: Foydalanuvchining to'liq ismi — bo'lsa. Login ko'pincha raqam
    #: (HEMIS ID), ro'yxatda esa ism kerak.
    full_name: Optional[str] = None
    role: Optional[str] = None
    event: str
    object_type: Optional[str] = None
    object_id: Optional[str] = None
    summary: Optional[str] = None
    meta: Optional[dict] = None
    ip: Optional[str] = None
    user_agent: Optional[str] = None


class AuditListRequest(BaseModel):
    #: Login yoki ism bo'yicha qidiruv.
    search: Optional[str] = None
    #: Aniq foydalanuvchi.
    user_id: Optional[int] = None
    #: Hodisa nomi (`login`, `question.deleted`...).
    event: Optional[str] = None
    #: Faqat kirish-chiqish hodisalari.
    only_auth: Optional[bool] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None

    page: int = 1
    limit: int = 50

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.limit if self.page > 1 else 0


class AuditListResponse(BaseModel):
    total: int
    page: int
    limit: int
    logs: list[AuditLogResponse]


class AuditEventOption(BaseModel):
    value: str
    #: Nechta yozuv bor — filtrni tanlashda foydali.
    count: int
