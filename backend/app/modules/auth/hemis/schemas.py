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
    # Найденные соответствия в нашей базе. Сервис их считает, но без объявления
    # здесь pydantic молча выбрасывал их из ответа, и подставить в форме уже
    # выбранный факультет/группу было нечем.
    user_id: Optional[int] = None
    faculty_id: Optional[int] = None
    group_id: Optional[int] = None
    user_exists: bool
    faculty_exists: bool
    group_exists: bool
    existing_results: list[dict] = []
    suggested_group: str = "N/A"


class HemisSyncResponse(BaseModel):
    success: bool
    message: str
    user_id: Optional[int] = None
