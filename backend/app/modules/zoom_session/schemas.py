from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.mixins.time_stamp_mixin import to_naive_utc
from app.core.schemas import TASHKENT_TZ, TashkentDatetime

SessionStatus = Literal["upcoming", "open", "closed"]


def _as_utc(value: datetime) -> datetime:
    """Mijoz vaqtni ISO'da zona bilan yuboradi; zonasiz kelsa — Toshkent vaqti."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=TASHKENT_TZ)
    return to_naive_utc(value)


class ZoomSessionRequest(BaseModel):
    """Seansni yaratish va tahrirlash (PUT — to'liq almashtirish)."""

    title: str = Field(min_length=1, max_length=255)
    link_url: str = Field(min_length=1, max_length=500)
    starts_at: datetime
    ends_at: datetime
    group_ids: list[int] = Field(min_length=1, max_length=200)
    subject_id: Optional[int] = None
    face_check_enabled: bool = True
    is_active: bool = True

    @field_validator("title", "link_url", mode="before")
    @classmethod
    def _strip(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("starts_at", "ends_at")
    @classmethod
    def _utc(cls, value: datetime) -> datetime:
        return _as_utc(value)

    @model_validator(mode="after")
    def _order(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("Tugash vaqti boshlanishdan keyin bo'lishi kerak")
        return self


class SessionGroup(BaseModel):
    id: int
    name: str


class ZoomSessionResponse(BaseModel):
    id: int
    title: str
    starts_at: TashkentDatetime
    ends_at: TashkentDatetime
    #: Talaba qo'shila oladigan payt (boshlanishdan biroz oldin).
    opens_at: TashkentDatetime
    status: SessionStatus
    subject_id: Optional[int] = None
    subject_name: Optional[str] = None
    groups: List[SessionGroup] = []
    face_check_enabled: bool
    is_active: bool
    #: Tahrirlash va hisobot — yaratuvchi va admin.
    can_manage: bool = False
    #: Havola faqat yaratuvchi va adminga: talaba undan Zoom ilovasi orqali
    #: LMS'ni chetlab kirib olardi.
    link_url: Optional[str] = None
    created_by_name: Optional[str] = None


class ZoomSessionListResponse(BaseModel):
    sessions: List[ZoomSessionResponse]


class ZoomJoinResponse(BaseModel):
    signature: str
    sdk_key: str
    meeting_number: str
    passcode: Optional[str] = None
    topic: str
    #: Zoom'dagi ism — LMS'dan: «Familiya Ism · Guruh».
    user_name: str


# ── Yuz tekshiruvi (ilgari `course/face_check/schemas.py`) ────────────────────

CHECK_STAGES = Literal["join", "random"]
CHECK_STATUSES = Literal[
    "ok",
    "no_face",
    "multiple_faces",
    "different_person",
    "no_reference",
    "no_camera",
    # Sahifa fonda qolgan: kadr ishonchsiz, talabani ayblamaydi.
    "page_hidden",
]


class FaceCheckRequest(BaseModel):
    # Kadr — base64 JPEG. Natijani server hal qiladi.
    image_base64: Optional[str] = Field(default=None, max_length=4_000_000)
    stage: CHECK_STAGES = "random"
    camera_unavailable: bool = False
    page_hidden: bool = False


class FaceCheckResponse(BaseModel):
    id: int
    status: CHECK_STATUSES
    message: str
    #: `join` da `ok` bo'lsa — endi `POST /join` imzo beradi.
    admitted: bool = False


class AbsencePeriod(BaseModel):
    """Yuz ko'rinmagan bir davr; `end` `None` — oxirigacha qaytmagan."""

    start: TashkentDatetime
    end: Optional[TashkentDatetime] = None
    duration_seconds: int
    checks: int
    statuses: List[str]
    image_check_ids: List[int] = []


class FaceCheckStudentSummary(BaseModel):
    user_id: int
    user_name: Optional[str] = None
    group_name: Optional[str] = None
    #: Seansga umuman kirmagan (guruhda bor, tekshiruvi yo'q).
    joined: bool = True
    total: int = 0
    passed: int = 0
    failed: int = 0
    first_check: Optional[TashkentDatetime] = None
    last_check: Optional[TashkentDatetime] = None
    tracked_seconds: int = 0
    absent_seconds: int = 0
    periods: List[AbsencePeriod] = []
    ended_absent: bool = False
    left_early: bool = False

    model_config = ConfigDict(from_attributes=True)


class FaceCheckReportResponse(BaseModel):
    session_id: int
    students: List[FaceCheckStudentSummary]
