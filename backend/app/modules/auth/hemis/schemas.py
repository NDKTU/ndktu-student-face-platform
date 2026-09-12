from typing import List, Literal, Optional

from pydantic import BaseModel

from app.core.schemas import TashkentDatetime


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
