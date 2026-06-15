from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class HemisLoginRequest(BaseModel):
    login: str
    password: str
    faculty_id: Optional[int] = None
    group_id: Optional[int] = None


class HemisLoginResponse(BaseModel):
    type: str = "Bearer"
    access_token: str


class HemisTransactionResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    student_id: Optional[int] = None
    login: str
    login_type: str
    status: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class HemisTransactionListResponse(BaseModel):
    items: list[HemisTransactionResponse]
    total: int
    page: int
    page_size: int


class HemisPreviewResponse(BaseModel):
    hemis_data: dict
    user_exists: bool
    faculty_exists: bool
    group_exists: bool
    existing_results: list[dict] = []
    suggested_group: str = "N/A"


class HemisSyncResponse(BaseModel):
    success: bool
    message: str
    user_id: Optional[int] = None
