from datetime import datetime
from typing import Any, List, Literal, Optional
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.schemas import TashkentDatetime

STATUS_VALUES = Literal["draft", "published", "archived"]
AUDIENCE_VALUES = Literal["all", "faculty", "group", "level"]


def _normalize_link(value: Optional[str]) -> Optional[str]:
    """E'lon havolasini tekshiradi va sxemasini to'ldiradi.

    Maydon oldin umuman tekshirilmasdi: `not-a-url` ham saqlanib ketardi va
    kartochkada `<a href="not-a-url">` bo'lib chiqardi — brauzer uni nisbiy
    yo'l deb bilib, talabani SPA ichidagi mavjud bo'lmagan sahifaga olib
    ketardi.

    Sxemasiz kiritilgan manzil (`epmos.nsumt.uz/...`) rad etilmaydi, balki
    `https://` bilan to'ldiriladi: odamlar havolani shunday ko'chirib
    qo'yishadi va buni xato deb qaytarish bekorga to'siq bo'lardi.

    Faqat `http`/`https` qoladi. `javascript:` va `data:` ataylab rad etiladi —
    e'lon matnini istalgan o'qituvchi yozadi, havola esa boshqa talabalarning
    brauzerida ochiladi.
    """
    if value is None:
        return None

    raw = value.strip()
    if not raw:
        return None

    parts = urlsplit(raw)
    if not parts.scheme:
        # `//nsumt.uz/x` — sxemasiz nusxa ko'chirishning odatiy shakli:
        # ikkinchi marta qo'shsak, `https:////nsumt.uz` bo'lib ketardi.
        raw = f"https:{raw}" if raw.startswith("//") else f"https://{raw}"
        parts = urlsplit(raw)

    if parts.scheme not in ("http", "https"):
        raise ValueError("Havola http:// yoki https:// bilan boshlanishi kerak")
    # `urlsplit` hostni tekshirmaydi: `https://` ham bo'sh host bilan o'tib
    # ketardi. Nuqta talab qilinadi — domensiz manzil havola emas.
    if not parts.hostname or "." not in parts.hostname:
        raise ValueError("Havolada to'g'ri domen ko'rsatilmagan")

    return raw


class AnnouncementAuthorInfo(BaseModel):
    id: int
    username: str
    model_config = ConfigDict(from_attributes=True)


class AnnouncementBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    body: str = ""
    image_url: Optional[str] = None
    status: STATUS_VALUES = "draft"
    pinned: bool = False
    publish_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    registration_enabled: bool = False
    event_at: Optional[datetime] = None
    location: Optional[str] = Field(default=None, max_length=255)
    link_url: Optional[str] = Field(default=None, max_length=500)
    capacity: Optional[int] = Field(default=None, ge=1)
    registration_deadline: Optional[datetime] = None
    audience_kind: AUDIENCE_VALUES = "all"
    #: `audience_kind` ga mos qiymatlar: guruhda id lar, fakultet va kursda satrlar.
    audience_values: List[Any] = []

    @field_validator("link_url")
    @classmethod
    def _check_link(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_link(value)


class AnnouncementCreateRequest(AnnouncementBase):
    pass


class AnnouncementUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    body: Optional[str] = None
    image_url: Optional[str] = None
    status: Optional[STATUS_VALUES] = None
    pinned: Optional[bool] = None
    publish_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    registration_enabled: Optional[bool] = None
    event_at: Optional[datetime] = None
    location: Optional[str] = Field(default=None, max_length=255)
    link_url: Optional[str] = Field(default=None, max_length=500)
    capacity: Optional[int] = Field(default=None, ge=1)
    registration_deadline: Optional[datetime] = None
    audience_kind: Optional[AUDIENCE_VALUES] = None
    audience_values: Optional[List[Any]] = None

    @field_validator("link_url")
    @classmethod
    def _check_link(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_link(value)


class AnnouncementResponse(BaseModel):
    id: int
    title: str
    body: str
    image_url: Optional[str] = None
    status: str
    pinned: bool
    publish_at: Optional[TashkentDatetime] = None
    expires_at: Optional[TashkentDatetime] = None
    registration_enabled: bool
    event_at: Optional[TashkentDatetime] = None
    location: Optional[str] = None
    link_url: Optional[str] = None
    capacity: Optional[int] = None
    registration_deadline: Optional[TashkentDatetime] = None
    audience_kind: str
    audience_values: List[Any] = []
    created_by_user_id: Optional[int] = None
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    #: Yozilganlar soni — ro'yxat so'rovida hisoblanadi.
    registered_count: int = 0
    #: Bo'sh joy. `capacity` yo'q bo'lsa — None (cheklanmagan).
    seats_left: Optional[int] = None
    #: So'rov yuborgan foydalanuvchi yozilganmi. Faqat lentada ma'noga ega.
    is_registered: bool = False
    #: Yozilish hozir ochiqmi: muddat o'tmagan va joy bor.
    registration_open: bool = False

    model_config = ConfigDict(from_attributes=True)


class AnnouncementListRequest(BaseModel):
    status: Optional[STATUS_VALUES] = None
    search: Optional[str] = None
    page: int = 1
    limit: int = 20

    @property
    def offset(self) -> int:
        if self.page < 1:
            return 0
        return (self.page - 1) * self.limit


class AnnouncementListResponse(BaseModel):
    total: int
    page: int
    limit: int
    announcements: List[AnnouncementResponse]


class AnnouncementFeedRequest(BaseModel):
    #: Faqat ro'yxatdan o'tiladigan tadbirlar.
    only_events: bool = False
    page: int = 1
    limit: int = 20

    @property
    def offset(self) -> int:
        if self.page < 1:
            return 0
        return (self.page - 1) * self.limit


class RegistrationStudentInfo(BaseModel):
    full_name: Optional[str] = None
    group_name: Optional[str] = None
    faculty: Optional[str] = None
    level: Optional[str] = None


class RegistrationResponse(BaseModel):
    id: int
    user_id: int
    username: Optional[str] = None
    status: str
    created_at: TashkentDatetime
    student: Optional[RegistrationStudentInfo] = None

    model_config = ConfigDict(from_attributes=True)


class RegistrationListResponse(BaseModel):
    total: int
    #: Faqat `registered` holatidagilar — tashkilotchi shu songa tayanadi.
    active_total: int
    registrations: List[RegistrationResponse]


class AudienceGroupOption(BaseModel):
    id: int
    name: str


class AudienceOptionsResponse(BaseModel):
    """Auditoriya uchun tanlash mumkin bo'lgan qiymatlar.

    Ro'yxat `students` jadvalidan yig'iladi, spravochnikdan emas: fakultet va
    kurs u yerda HEMIS'dagi satr sifatida yotadi, va lentaning filtri aynan
    shu satrlar bilan solishtiradi. Spravochnik nomlari bilan to'ldirilsa,
    e'lon hech kimga ko'rinmay qolardi.
    """

    faculties: List[str] = []
    levels: List[str] = []
    groups: List[AudienceGroupOption] = []
