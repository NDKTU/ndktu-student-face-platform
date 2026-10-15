from datetime import date, time
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.schemas import TashkentDatetime


class HemisLoginRequest(BaseModel):
    login: str
    password: str
    faculty_id: Optional[int] = None
    group_id: Optional[int] = None


class HemisLoginResponse(BaseModel):
    type: str = "Bearer"
    access_token: str


HemisOAuthPortal = Literal["student", "employee"]


class HemisOAuthPortalsResponse(BaseModel):
    """Какие кнопки «HEMIS orqali kirish» показывать на странице входа."""

    portals: list[HemisOAuthPortal]


class HemisOAuthAuthorizeResponse(BaseModel):
    url: str


class HemisOAuthCallbackRequest(BaseModel):
    code: str
    state: str


class HemisPreviewResponse(BaseModel):
    hemis_data: dict
    user_id: Optional[int] = None
    user_exists: bool
    # Найденные в зеркале строки. Без них экран сопоставления не мог подставить
    # то, что нашёл сервер: response_model отбрасывал поля, которых нет в схеме.
    faculty_id: Optional[int] = None
    faculty_exists: bool
    group_id: Optional[int] = None
    group_exists: bool
    existing_results: list[dict] = []
    suggested_group: str = "N/A"


class HemisSyncResponse(BaseModel):
    success: bool
    message: str
    user_id: Optional[int] = None


# ── Ma'lumot API tokeni ───────────────────────────────────────────────────────


class HemisDataSettingsIn(BaseModel):
    data_url: Optional[str] = None
    #: Bo'sh qoldirilsa — token o'zgarmaydi. Forma joriy tokenni ko'rsatmaydi,
    #: shuning uchun bo'sh yuborish uni o'chirib yubormasligi kerak.
    token: Optional[str] = None


class HemisDataSettingsOut(BaseModel):
    source: Literal["env", "db"]
    data_url: str
    has_token: bool = False
    #: Tokenning oxirgi to'rt belgisi — bir kalitni ikkinchisidan ajratish uchun.
    token_tail: str = ""
    last_ok_at: Optional[TashkentDatetime] = None
    updated_at: Optional[TashkentDatetime] = None


class HemisDataProbeResponse(BaseModel):
    ok: bool
    total: int = 0
    detail: Optional[str] = None


# ── Guruhlarni bog'lash ───────────────────────────────────────────────────────


class GroupMatchProposal(BaseModel):
    """Bitta HEMIS guruhi uchun taklif.

    `auto` — ishonchli va o'zi qo'llanadi, `review` — admin tasdiqlashi kerak,
    `unmatched` — mos keladigan mahalliy guruh topilmadi.
    """

    hemis_group_id: int
    hemis_group_name: str
    student_count: int = 0
    kind: Literal["auto", "review", "unmatched", "already"] = "unmatched"
    #: `vote` — mavjud talabalarimiz bo'yicha ovoz berish, `name` — nom mos
    #: keldi, `existing` — allaqachon bog'langan.
    reason: Literal["vote", "name", "existing", "none"] = "none"
    group_id: Optional[int] = None
    group_name: Optional[str] = None
    #: Admin tanlashi uchun o'xshash nomlar (ishonch bo'lmaganda).
    candidates: List[dict] = []


class GroupMatchPreviewResponse(BaseModel):
    run_id: str
    hemis_total_students: int = 0
    hemis_groups: int = 0
    local_groups: int = 0
    auto_count: int = 0
    review_count: int = 0
    unmatched_count: int = 0
    already_count: int = 0
    #: Bog'lanmagan guruhlardagi talabalar — ular guruhsiz import bo'ladi.
    students_without_group: int = 0
    proposals: List[GroupMatchProposal] = []


class GroupMatchDecision(BaseModel):
    hemis_group_id: int
    #: `null` — bog'lamaslik (masalan, bu HEMIS guruhi bizda umuman yo'q).
    group_id: Optional[int] = None


class GroupMatchApplyRequest(BaseModel):
    run_id: str
    #: Avtomatik takliflarni ham qo'llash. False bo'lsa faqat `decisions`.
    apply_auto: bool = True
    decisions: List[GroupMatchDecision] = []


class GroupMatchApplyResponse(BaseModel):
    linked: int = 0
    skipped: int = 0
    conflicts: List[str] = []


# ── Talabalar importi ─────────────────────────────────────────────────────────


class StudentSyncPreviewResponse(BaseModel):
    hemis_total: int = 0
    create_count: int = 0
    update_count: int = 0
    #: Guruhi bizda topilmaganlar — ular import qilinmaydi.
    no_group_count: int = 0
    #: Bizda bor, lekin HEMIS faollari orasida yo'q. Hech kim o'chirilmaydi —
    #: faqat ro'yxat, qarorni admin qabul qiladi.
    missing_locally: int = 0
    linked_groups: int = 0
    missing_examples: List[str] = []
    #: True — yaratiladigan yozuvlar ko'p, apply alohida tasdiq talab qiladi.
    needs_bulk_confirm: bool = False


class StudentSyncApplyRequest(BaseModel):
    #: True — faqat oxirgi prognozdan keyin o'zgarganlar (`updated_at_from`).
    #: Tungi prognoz uchun: har kecha 49 sahifani aylanish shart emas.
    incremental: bool = False

    # ---- Qaysi toifalar import qilinsin -------------------------------- #
    # Admin ekranda ikkita belgidan foydalanadi. Sukut bo'yicha ikkalasi ham
    # yoqilgan: shunda eski chaqiruvlar (tungi prognoz, CLI) o'zgarishsiz
    # ishlayveradi — ular bu maydonlarni umuman yubormaydi.
    #: Bazada yo'q talabalarni yaratish.
    include_create: bool = True
    #: Bazada bor talabalarning ma'lumotini yangilash.
    include_update: bool = True
    #: Ommaviy yaratishga ruxsat. Birinchi to'ldirish (≈5700 talaba) — qonuniy
    #: holat, lekin u ongli bosish bo'lishi kerak, tungi prognozning nojo'ya
    #: ta'siri emas.
    allow_bulk_create: bool = False


class StudentSyncApplyResponse(BaseModel):
    incremental: bool = False
    fetched: int = 0
    created: int = 0
    updated: int = 0
    #: Nomeri yo'q yoki takrorlangan yozuvlar.
    skipped: int = 0
    #: Admin toifani tanlamagani uchun import qilinmaganlar. `skipped` dan
    #: alohida: u — ma'lumot buzuq, bu — ongli qaror. Guruhi yo'qlar bu yerga
    #: kirmaydi, ular `no_group` da sanaladi.
    excluded: int = 0
    no_group: int = 0
    missing_locally: int = 0


# ── Jadval (schedule-list) ────────────────────────────────────────────────────


class ScheduleSyncRequest(BaseModel):
    #: HEMIS o'quv yili kodi ("2025"). Bo'sh — joriy yil, HEMIS o'zi tanlaydi.
    education_year: Optional[str] = Field(default=None, pattern=r"^\d{4}$")
    #: 10% dan ko'p darsni nofaol qilishga ruxsat. HEMIS uzilishda xato emas,
    #: qisqa ro'yxat bilan 200 qaytaradi — shuning uchun ongli tasdiq kerak.
    allow_bulk_deactivate: bool = False


class ScheduleSyncResponse(BaseModel):
    education_years: List[str] = []
    #: HEMIS qaytargan qatorlar (takrorlar bilan).
    fetched: int = 0
    #: Noyob darslar — bazaga yozilganlar.
    saved: int = 0
    #: Oxirgi sahifadagi `totalCount`.
    hemis_total: int = 0
    deactivated: int = 0
    #: `employee-list` da topilmagan o'qituvchili darslar — saqlangan, lekin
    #: hech kimning "mening jadvalim"ida ko'rinmaydi.
    without_employee_number: int = 0
    #: To'liq o'tildimi. Yo'q bo'lsa, nofaol qilish o'tkazib yuborilgan.
    complete: bool = False
    #: Nima uchun nofaol qilish bajarilmagani (bo'lsa).
    deactivation_skipped: Optional[str] = None


class ScheduleLessonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    hemis_id: int
    education_year: str
    education_year_name: str
    semester_code: str
    semester_name: str
    group_hemis_id: Optional[int] = None
    group_name: str
    education_lang: str
    subject_hemis_id: Optional[int] = None
    subject_code: str
    subject_name: str
    faculty_hemis_id: Optional[int] = None
    faculty_name: str
    department_hemis_id: Optional[int] = None
    department_name: str
    auditorium_code: Optional[int] = None
    auditorium_name: str
    auditorium_type: str
    building_name: str
    training_type_code: str
    training_type: str
    lesson_pair: str
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    employee_hemis_id: Optional[int] = None
    employee_id_number: Optional[str] = None
    employee_name: str
    lesson_date: date
    is_active: bool


class ScheduleListRequest(BaseModel):
    group_hemis_id: Optional[int] = None
    employee_id_number: Optional[str] = None
    subject_hemis_id: Optional[int] = None
    education_year: Optional[str] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    include_inactive: bool = False

    page: int = Field(default=1, ge=1)
    limit: int = Field(default=50, ge=1, le=500)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.limit


class ScheduleListResponse(BaseModel):
    items: List[ScheduleLessonOut]
    total: int
    page: int
    limit: int


class ScheduleFilterOption(BaseModel):
    value: str
    label: str


class ScheduleFiltersResponse(BaseModel):
    education_years: List[ScheduleFilterOption] = []
    groups: List[ScheduleFilterOption] = []
    employees: List[ScheduleFilterOption] = []
    subjects: List[ScheduleFilterOption] = []


class MyScheduleRequest(BaseModel):
    #: Bo'sh bo'lsa — joriy hafta (dushanbadan yakshanbagacha).
    date_from: Optional[date] = None
    date_to: Optional[date] = None


class MyScheduleResponse(BaseModel):
    #: Kim sifatida qidirildi. `None` — o'qituvchi ham, talaba ham emas.
    as_role: Optional[Literal["teacher", "student"]] = None
    date_from: date
    date_to: date
    items: List[ScheduleLessonOut] = []
