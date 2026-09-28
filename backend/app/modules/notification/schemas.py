from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    title: str
    body: str
    payload: Optional[dict] = None
    is_read: bool
    read_at: Optional[datetime] = None
    created_at: datetime


class NotificationListResponse(BaseModel):
    total: int
    #: O'qilmaganlar soni — har safar alohida so'rov qilmaslik uchun
    #: ro'yxat bilan birga qaytadi: qo'ng'iroqcha ustidagi raqam shu.
    unread: int
    page: int
    limit: int
    notifications: list[NotificationResponse]


class UnreadCountResponse(BaseModel):
    unread: int


class MarkReadResponse(BaseModel):
    #: Nechta bildirishnoma o'qilgan deb belgilandi.
    updated: int
