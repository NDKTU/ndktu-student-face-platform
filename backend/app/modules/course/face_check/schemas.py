from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict

from app.core.schemas import TashkentDatetime

CHECK_STAGES = Literal["join", "random"]
CHECK_STATUSES = Literal[
    "ok",
    "no_face",
    "multiple_faces",
    "different_person",
    "no_reference",
    "no_camera",
]


class FaceCheckRequest(BaseModel):
    # Kadr — base64 JPEG. Tekshiruvni server bajaradi: natijaga mijoz emas,
    # faqat servis qaror qiladi.
    image_base64: Optional[str] = None
    stage: CHECK_STAGES = "random"
    # Kamera ochilmagan/ruxsat berilmagan holat: kadrsiz keladi.
    camera_unavailable: bool = False


class FaceCheckResponse(BaseModel):
    id: int
    status: CHECK_STATUSES
    # Talabaga ko'rsatiladigan qisqa izoh.
    message: str


class FaceCheckItem(BaseModel):
    id: int
    user_id: int
    user_name: Optional[str] = None
    stage: CHECK_STAGES
    status: CHECK_STATUSES
    has_image: bool
    created_at: TashkentDatetime

    model_config = ConfigDict(from_attributes=True)


class FaceCheckStudentSummary(BaseModel):
    user_id: int
    user_name: Optional[str] = None
    total: int
    passed: int
    failed: int
    checks: List[FaceCheckItem]


class FaceCheckReportResponse(BaseModel):
    lesson_id: int
    students: List[FaceCheckStudentSummary]
