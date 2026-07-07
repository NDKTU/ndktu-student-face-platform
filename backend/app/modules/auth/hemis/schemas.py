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
