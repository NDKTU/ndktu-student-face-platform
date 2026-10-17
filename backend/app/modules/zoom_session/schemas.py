from datetime import date, datetime, timedelta
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

    #: Bo'sh — fan, o'qituvchi va guruhlardan yasaladi (`repository.py::_auto_title`).
    title: Optional[str] = Field(default=None, max_length=255)
    #: O'qituvchi (`users.id`). O'qituvchi o'zi yaratsa — doim o'zi.
    teacher_user_id: Optional[int] = None
    #: Bo'sh — uchrashuvni bekend Zoom API orqali o'zi yaratadi (`zoom_managed`).
    #: Shunday yaratilgan seansda havola e'tiborga olinmaydi.
    link_url: Optional[str] = Field(default=None, max_length=500)
    #: Qaysi Zoom akkaunti. `None` — avtomatik (bo'sh akkaunt yoki havoladan
    #: aniqlanadi), `0` — `.env` dagi kalitlar. API yaratgan seansda o'zgarmaydi.
    zoom_account_id: Optional[int] = Field(default=None, ge=0)
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

    @field_validator("title", "link_url")
    @classmethod
    def _empty_to_none(cls, value: Optional[str]) -> Optional[str]:
        return value or None

    @field_validator("starts_at", "ends_at")
    @classmethod
    def _utc(cls, value: datetime) -> datetime:
        return _as_utc(value)

    @model_validator(mode="after")
    def _order(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("Tugash vaqti boshlanishdan keyin bo'lishi kerak")
        return self


#: Seriyada eng ko'pi bilan shuncha sana: semestr (≈16 hafta) bemalol sig'adi,
#: xato kiritilgan «yil oxirigacha» esa yuzlab Zoom uchrashuvini yaratmaydi.
SERIES_MAX_OCCURRENCES = 30

SeriesRepeat = Literal["weekly", "biweekly"]

#: Takrorlash qadami — kunlarda.
REPEAT_STEP_DAYS = {"weekly": 7, "biweekly": 14}


class ZoomSeriesRequest(ZoomSessionRequest):
    """Takrorlanadigan seanslar: birinchi sana `starts_at`/`ends_at`, keyin har
    hafta yoki har 2 haftada `repeat_until` gacha. `skip_dates` — bayram va
    ta'til kunlari (Toshkent sanasi), ular yaratilmaydi."""

    repeat: SeriesRepeat
    repeat_until: date
    skip_dates: list[date] = Field(default_factory=list, max_length=SERIES_MAX_OCCURRENCES)

    def occurrences(self) -> list[tuple[datetime, datetime]]:
        """Barcha sanalar (UTC, naive) — `skip_dates` siz.

        Sana Toshkent bo'yicha solishtiriladi: 08:00 dagi dars UTC da hali
        kechagi kun (03:00), lekin kalendarda — bugun.
        """
        step = timedelta(days=REPEAT_STEP_DAYS[self.repeat])
        duration = self.ends_at - self.starts_at
        skip = set(self.skip_dates)
        result: list[tuple[datetime, datetime]] = []
        current = self.starts_at
        while _local_date(current) <= self.repeat_until:
            if _local_date(current) not in skip:
                result.append((current, current + duration))
            current += step
        return result

    @model_validator(mode="after")
    def _series_bounds(self):
        if self.repeat_until < _local_date(self.starts_at):
            raise ValueError("«Qachongacha» sanasi birinchi darsdan oldin bo'lmasin")
        dates = self.occurrences()
        if not dates:
            raise ValueError("Birorta ham sana qolmadi — o'tkazib yuboriladigan kunlarni tekshiring")
        if len(dates) > SERIES_MAX_OCCURRENCES:
            raise ValueError(f"Seriyada {SERIES_MAX_OCCURRENCES} tadan ko'p dars bo'lmasin — sanani yaqinroq qo'ying")
        return self


def _local_date(value: datetime) -> date:
    """UTC (naive) → Toshkent sanasi."""
    return (value + timedelta(hours=5)).date()


class ZoomSeriesFailure(BaseModel):
    """Seriyaning yaratilmagan yoki o'zgartirilmagan sanasi va sababi."""

    starts_at: TashkentDatetime
    reason: str


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
    teacher_user_id: Optional[int] = None
    teacher_name: Optional[str] = None
    groups: List[SessionGroup] = []
    face_check_enabled: bool
    is_active: bool
    #: Tahrirlash va hisobot — yaratuvchi va admin.
    can_manage: bool = False
    #: Havola faqat yaratuvchi va adminga: talaba undan Zoom ilovasi orqali
    #: LMS'ni chetlab kirib olardi.
    link_url: Optional[str] = None
    created_by_name: Optional[str] = None
    #: Uchrashuvni bekend Zoom API orqali yaratgan: talaba shaxsiy token bilan
    #: kiradi, o'qituvchi uni «Host sifatida boshlash» orqali ochadi.
    zoom_managed: bool = False
    #: Faqat yaratuvchi va adminga. `0` — `.env` akkaunti.
    zoom_account_id: Optional[int] = None
    zoom_account_name: Optional[str] = None
    #: Seriyadagi seans: kalit, o'rni va jami soni («3 / 8»).
    series_id: Optional[str] = None
    series_position: Optional[int] = None
    series_total: Optional[int] = None


class ZoomSeriesResponse(BaseModel):
    series_id: str
    created: List[ZoomSessionResponse] = []
    #: Yaratilmagan sanalar: masalan, shu vaqtda barcha akkauntlar band.
    failed: List[ZoomSeriesFailure] = []


class ZoomSeriesUpdateResponse(BaseModel):
    """«Shu va keyingilari»ni o'zgartirish natijasi."""

    updated: int = 0
    failed: List[ZoomSeriesFailure] = []
    session: Optional[ZoomSessionResponse] = None


class ZoomSessionListResponse(BaseModel):
    sessions: List[ZoomSessionResponse]


class ZoomTeacherOption(BaseModel):
    user_id: int
    name: str
    kafedra_name: Optional[str] = None


class ZoomTeacherOptionListResponse(BaseModel):
    teachers: List[ZoomTeacherOption]
    #: Joriy foydalanuvchi o'qituvchi (admin emas) — faqat o'zini tanlay oladi.
    locked: bool = False


class ZoomSubjectOption(BaseModel):
    id: int
    name: str


class ZoomSubjectOptionListResponse(BaseModel):
    subjects: List[ZoomSubjectOption]


class ZoomAccountOption(BaseModel):
    #: `0` — `.env` akkaunti.
    id: int
    name: str
    #: Shu akkauntda uchrashuvni LMS o'zi yarata oladi (S2S ilovasi bor).
    auto_create: bool


class ZoomCapabilitiesResponse(BaseModel):
    #: Hech bo'lmasa bitta akkauntda Zoom API sozlangan — havolasiz seans yaratsa bo'ladi.
    auto_create: bool
    accounts: List[ZoomAccountOption] = []


class ZoomStartResponse(BaseModel):
    #: Host sifatida boshlash havolasi (ichida ZAK, ~2 soat amal qiladi).
    start_url: str


class ZoomJoinResponse(BaseModel):
    signature: str
    sdk_key: str
    meeting_number: str
    passcode: Optional[str] = None
    topic: str
    #: Zoom'dagi ism — LMS'dan: «Familiya Ism · Guruh».
    user_name: str
    #: Ro'yxatdan o'tish talab qilingan uchrashuvda shaxsiy kirish tokeni (SDK `tk`).
    registrant_token: Optional[str] = None
    #: SDK `customerKey`: webhook hodisasida ishtirokchini foydalanuvchiga bog'laydi.
    customer_key: str
    #: Host ZAK tokeni (SDK `zak`) — faqat darsni olib boruvchi o'qituvchiga.
    zak: Optional[str] = None
    #: Telefon uchun: Zoom ilovasiga shaxsiy havola (faqat `?app=1` so'ralganda).
    #: Brauzerdagi SDK (Component View) telefon va planshetda qo'llanmaydi.
    app_join_url: Optional[str] = None


# ── Yuz tekshiruvi (ilgari `course/face_check/schemas.py`) ────────────────────

CHECK_STAGES = Literal["join", "random"]
CHECK_STATUSES = Literal[
    "ok",
    "no_face",
    "multiple_faces",
    "different_person",
    "no_reference",
    # Tirik yuz emas — rasm yoki ekran (`liveness_mode=enforce` da).
    "spoof",
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


class ZoomVisit(BaseModel):
    """Uchrashuvga bir kirish; `left_at` `None` — hali ichida (yoki chiqishi kelmagan)."""

    joined_at: TashkentDatetime
    left_at: Optional[TashkentDatetime] = None


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
    #: Zoom webhook bo'yicha uchrashuvda o'tirgan vaqt; `None` — hodisa yo'q.
    zoom_seconds: Optional[int] = None
    zoom_first_join: Optional[TashkentDatetime] = None
    #: Har bir kirish alohida: chiqib, qayta kirgani hisobotda ko'rinsin.
    zoom_visits: List[ZoomVisit] = []

    model_config = ConfigDict(from_attributes=True)


class ZoomOutsider(BaseModel):
    """Uchrashuvda bo'lgan, lekin LMS orqali kirmagan ishtirokchi."""

    name: Optional[str] = None
    first_join: TashkentDatetime
    seconds: int


class FaceCheckReportResponse(BaseModel):
    session_id: int
    students: List[FaceCheckStudentSummary]
    #: Webhook hodisalari kelganmi — kelmagan bo'lsa Zoom ustunlari ko'rsatilmaydi.
    zoom_tracked: bool = False
    outsiders: List[ZoomOutsider] = []



# ── Zoom akkauntlari (admin) ──────────────────────────────────────────────────


class ZoomAccountRequest(BaseModel):
    """Yaratish va tahrirlash. Sir bo'sh yuborilsa — saqlangani o'zgarmaydi."""

    name: str = Field(min_length=1, max_length=100)
    host_email: Optional[str] = Field(default=None, max_length=255)
    api_account_id: Optional[str] = Field(default=None, max_length=64)
    api_client_id: Optional[str] = Field(default=None, max_length=128)
    api_client_secret: Optional[str] = Field(default=None, max_length=255)
    sdk_key: str = Field(min_length=1, max_length=128)
    sdk_secret: Optional[str] = Field(default=None, max_length=255)
    webhook_secret_token: Optional[str] = Field(default=None, max_length=255)
    is_active: bool = True

    @field_validator(
        "name",
        "host_email",
        "api_account_id",
        "api_client_id",
        "api_client_secret",
        "sdk_key",
        "sdk_secret",
        "webhook_secret_token",
        mode="before",
    )
    @classmethod
    def _strip(cls, value):
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value


class ZoomAccountResponse(BaseModel):
    """Sirlarning o'zi qaytmaydi — faqat bor-yo'qligi."""

    #: `0` — `.env` akkaunti (faqat ko'rish uchun, tahrirlanmaydi).
    id: int
    name: str
    host_email: Optional[str] = None
    api_account_id: Optional[str] = None
    api_client_id: Optional[str] = None
    sdk_key: Optional[str] = None
    has_api_secret: bool = False
    has_sdk_secret: bool = False
    has_webhook_secret: bool = False
    is_active: bool = True
    #: `.env` dan — sahifada tahrirlab bo'lmaydi.
    from_env: bool = False
    api_enabled: bool = False
    sdk_enabled: bool = False
    sessions_count: int = 0


class ZoomAccountListResponse(BaseModel):
    accounts: List[ZoomAccountResponse]


class ZoomAccountCheckResponse(BaseModel):
    """«Tekshirish»: API kaliti ishlaydimi va host litsenziyalimi."""

    api_ok: Optional[bool] = None
    api_message: Optional[str] = None
    host_email: Optional[str] = None
    host_licensed: Optional[bool] = None
    sdk_configured: bool = False
