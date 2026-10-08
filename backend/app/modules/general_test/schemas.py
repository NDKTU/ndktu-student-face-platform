from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.schemas import TashkentDatetime

OptionLetter = Literal["a", "b", "c", "d"]


class _LowerLetter(BaseModel):
    @field_validator("correct_option", mode="before", check_fields=False)
    @classmethod
    def _lower(cls, value):
        # В Excel и в форме буква приходит и как «B», и как «b».
        return value.strip().lower() if isinstance(value, str) else value


# ─── Fan ─────────────────────────────────────────────────────────────────────


class SubjectCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None

    @field_validator("name", mode="before")
    @classmethod
    def _strip(cls, value):
        return value.strip() if isinstance(value, str) else value


class SubjectUpdateRequest(SubjectCreateRequest):
    name: str | None = Field(default=None, min_length=1, max_length=255)


class SubjectRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class SubjectSummary(SubjectRef):
    description: str | None
    user_count: int = 0
    test_count: int = 0
    #: Fan savollar bankidagi savollar.
    question_count: int = 0
    created_at: TashkentDatetime
    #: Ega yoki admin: fanni tahrirlaydi, biriktiradi, test tuzadi. Aks holda
    #: foydalanuvchi fanga biriktirilgan — faqat savol qoʻshadi.
    can_manage: bool = False


class SubjectListResponse(BaseModel):
    total: int
    page: int
    limit: int
    subjects: list[SubjectSummary]


#: student — talaba profili bor; teacher — o'qituvchi profili bor;
#: other — ikkalasi ham yo'q (xodim, admin).
UserKind = Literal["student", "teacher", "other"]


class UserFilter(BaseModel):
    """Fanga foydalanuvchi tanlashdagi filtr.

    Nomzodlar ro'yxati ham, «filtrga mos hammasini qo'shish» ham shu
    filtrdan foydalanadi — ekranda ko'ringan ro'yxat bilan qo'shilgani bir xil
    bo'lishi uchun.
    """

    search: str | None = None
    kind: UserKind | None = None
    role_id: int | None = None
    faculty_id: int | None = None
    group_id: int | None = None
    course: int | None = Field(default=None, ge=1, le=7)


class UserListRequest(UserFilter):
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=200)


class SubjectUserRow(BaseModel):
    user_id: int
    full_name: str
    username: str | None
    user_kind: Literal["student", "teacher", "boshqa"]
    group_name: str | None
    #: Nomzodlar ro'yxatida: allaqachon shu fanga biriktirilganmi.
    assigned: bool = False


class SubjectUserListResponse(BaseModel):
    total: int
    page: int
    limit: int
    users: list[SubjectUserRow]


class SubjectUsersAddRequest(BaseModel):
    """`user_ids` — tanlanganlar; `filter` — filtrga mos hammasi. Bittasi shart."""

    user_ids: list[int] | None = Field(default=None, max_length=5000)
    filter: UserFilter | None = None


class SubjectUsersAddResponse(BaseModel):
    added: int


class FilterOption(BaseModel):
    id: int
    name: str


class FilterOptionsResponse(BaseModel):
    roles: list[FilterOption]
    faculties: list[FilterOption]


class GroupOption(BaseModel):
    id: int
    name: str
    faculty_name: str | None
    course: int | None
    student_count: int


class GroupOptionListResponse(BaseModel):
    groups: list[GroupOption]


# ─── Тест (управление) ───────────────────────────────────────────────────────


class GeneralTestCreateRequest(BaseModel):
    """Nom yo'q: u fan va guruhlardan avtomatik tuziladi."""

    subject_id: int
    #: Yaratishda darhol biriktiriladigan guruhlar (keyin ham qo'shsa bo'ladi).
    group_ids: list[int] = Field(default_factory=list, max_length=500)
    duration: int = Field(default=30, ge=1, le=600)
    attempt_limit: int = Field(default=1, ge=1, le=100)
    #: Bitta urinishdagi savollar soni; bo'sh — hammasi.
    question_number: int | None = Field(default=None, ge=1, le=1000)
    is_active: bool = False
    #: PIN bilan boshlanadimi. PIN'ning o'zini server yaratadi.
    pin_required: bool = False
    #: Qat'iy rejim: sahifadan chiqsa urinish yopiladi.
    strict_mode: bool = False


class GeneralTestUpdateRequest(BaseModel):
    subject_id: int | None = None
    duration: int | None = Field(default=None, ge=1, le=600)
    attempt_limit: int | None = Field(default=None, ge=1, le=100)
    #: `null` yuborilsa — «hammasi»; maydon umuman yuborilmasa — o'zgarmaydi.
    question_number: int | None = Field(default=None, ge=1, le=1000)
    is_active: bool | None = None
    #: PIN'ni yoqish/o'chirish. Yoqilganda (avval yo'q bo'lsa) server yangi
    #: PIN yaratadi; mavjudi saqlanib qoladi.
    pin_required: bool | None = None
    #: Yangi PIN yaratish — eskisi tarqalib ketgan bo'lsa.
    regenerate_pin: bool = False
    strict_mode: bool | None = None


class GeneralTestSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    subject: SubjectRef
    title: str
    duration: int
    attempt_limit: int
    question_number: int | None
    is_active: bool
    strict_mode: bool = False
    #: Faqat test egasi va admin ko'radigan javoblarda: talabaga
    #: (`AvailableTest`) PIN'ning o'zi emas, faqat `pin_required` boradi.
    pin: str | None = None
    #: Fan bankidagi barcha savollar (urinishga beriladigani — `question_number`).
    question_count: int = 0
    attempt_count: int = 0
    group_count: int = 0
    created_at: TashkentDatetime


class GeneralTestListResponse(BaseModel):
    total: int
    page: int
    limit: int
    tests: list[GeneralTestSummary]


# ─── Вопросы ─────────────────────────────────────────────────────────────────


class QuestionCreateRequest(_LowerLetter):
    text: str = Field(min_length=1)
    option_a: str = Field(min_length=1)
    option_b: str = Field(min_length=1)
    option_c: str = Field(min_length=1)
    option_d: str = Field(min_length=1)
    correct_option: OptionLetter = "a"
    order: int | None = None


class QuestionUpdateRequest(_LowerLetter):
    text: str | None = Field(default=None, min_length=1)
    option_a: str | None = Field(default=None, min_length=1)
    option_b: str | None = Field(default=None, min_length=1)
    option_c: str | None = Field(default=None, min_length=1)
    option_d: str | None = Field(default=None, min_length=1)
    correct_option: OptionLetter | None = None
    order: int | None = None


class QuestionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    subject_id: int
    text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_option: str
    order: int


class SubjectQuestionListResponse(BaseModel):
    questions: list[QuestionResponse]


class TestGroup(GroupOption):
    """Testga biriktirilgan guruh — yoqilgan yoki yashirilganligi bilan."""

    is_active: bool = True


class GeneralTestDetail(GeneralTestSummary):
    groups: list[TestGroup] = []


class TestGroupsAddRequest(BaseModel):
    group_ids: list[int] = Field(min_length=1, max_length=500)


class TestGroupUpdateRequest(BaseModel):
    is_active: bool


class UploadResponse(BaseModel):
    created: int
    warnings: list[str]


# ─── Прохождение ─────────────────────────────────────────────────────────────


class AvailableTest(BaseModel):
    id: int
    subject_name: str
    title: str
    duration: int
    attempt_limit: int
    #: Bitta urinishda beriladigan savollar soni.
    question_count: int
    attempts_used: int
    #: Незавершённая попытка — «Davom ettirish» вместо «Boshlash».
    in_progress_attempt_id: int | None = None
    best_score: int | None = None
    #: Новая попытка требует PIN (сам PIN студенту не отдаётся).
    pin_required: bool = False
    strict_mode: bool = False


class StartRequest(BaseModel):
    #: Тест с PIN: код от преподавателя. Без PIN или при возврате в попытку — не нужен.
    pin: str | None = Field(default=None, max_length=16)


class AvailableTestListResponse(BaseModel):
    tests: list[AvailableTest]


class TakeOption(BaseModel):
    #: Исходная буква варианта. Правильный ответ из неё не следует —
    #: на экране варианты перемешаны.
    key: str
    text: str


class TakeQuestion(BaseModel):
    id: int
    text: str
    options: list[TakeOption]
    selected: str | None = None


class AttemptState(BaseModel):
    attempt_id: int
    test_id: int
    title: str
    remaining_seconds: int
    questions: list[TakeQuestion]
    #: Brauzer sahifadan chiqishni kuzatadi va heartbeat yuboradi.
    strict_mode: bool = False


class AnswerRequest(BaseModel):
    question_id: int
    option: OptionLetter

    @field_validator("option", mode="before")
    @classmethod
    def _lower(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


class AttemptResult(BaseModel):
    attempt_id: int
    test_id: int
    title: str
    total_questions: int
    correct_answers: int
    score: int
    started_at: TashkentDatetime
    finished_at: TashkentDatetime | None
    #: Qat'iy testda yopilish sababi; bo'sh — oddiy yakun.
    stop_reason: str | None = None


class LeaveRequest(BaseModel):
    #: hidden, pagehide, blur, split — matnni server tanlaydi.
    reason: str | None = Field(default=None, max_length=32)


class HeartbeatResponse(BaseModel):
    alive: bool = True


class MyResultListResponse(BaseModel):
    results: list[AttemptResult]


# ─── Результаты (администратор) ──────────────────────────────────────────────


class ResultListRequest(BaseModel):
    subject_id: int | None = None
    test_id: int | None = None
    search: str | None = None
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=500)


class ResultRow(BaseModel):
    attempt_id: int
    test_id: int
    test_title: str
    subject_name: str
    user_id: int | None
    full_name: str
    username: str | None
    group_name: str | None
    #: student / teacher / boshqa — по тому, чей профиль нашёлся.
    user_kind: str
    total_questions: int
    correct_answers: int
    score: int
    started_at: TashkentDatetime
    finished_at: TashkentDatetime | None
    stop_reason: str | None = None


class ResultListResponse(BaseModel):
    total: int
    page: int
    limit: int
    results: list[ResultRow]

