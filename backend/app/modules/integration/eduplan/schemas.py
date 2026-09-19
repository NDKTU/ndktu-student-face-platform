"""Схемы обмена с EduPlan и схемы предпросмотра/применения синхронизации.

Модели EduPlan описаны нестрого (``extra="ignore"``): их API живёт своей
жизнью, и появление новых полей на той стороне не должно ронять наш прогон.
Персональные данные (passport_serial, jshshir, phone_number) здесь намеренно
не объявлены — то, что не описано, до нашей базы не доедет.
"""

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, computed_field


class EduPlanEntity(str, Enum):
    """Сущности, которые зеркалим. Значение = ключ в отчётах и решениях."""

    faculty = "faculty"
    kafedra = "kafedra"
    speciality = "speciality"
    group = "group"
    subject = "subject"
    teacher = "teacher"
    curriculum = "curriculum"


#: Порядок обхода. Ребёнок не может примениться раньше родителя: кафедра
#: требует факультет, специальность — кафедру, группа — специальность,
#: учебный план — специальность.
SYNC_ORDER: tuple[EduPlanEntity, ...] = (
    EduPlanEntity.faculty,
    EduPlanEntity.kafedra,
    EduPlanEntity.speciality,
    EduPlanEntity.group,
    # Reja fandan oldin: fan unga bog'lanadi (`subjects.curriculum_id`), va
    # to'liq progonda reja allaqachon ko'zguda bo'lishi kerak.
    EduPlanEntity.curriculum,
    EduPlanEntity.subject,
    EduPlanEntity.teacher,
)

#: От чего зависит каждая сущность. Пользователь запускает любую
#: синхронизацию отдельно, но разрешить ссылку на родителя можно только
#: если тот уже связан: кафедра без факультета не применится.
#:
#: Зависимости не запускаются сами — прогон одной сущности читает из EPMOS
#: только её, а родителей берёт из уже сохранённого зеркала. Если родитель
#: не связан, строка пропускается с внятной ошибкой, а не тянет за собой
#: чужой прогон.
ENTITY_DEPENDENCIES: dict[EduPlanEntity, tuple[EduPlanEntity, ...]] = {
    EduPlanEntity.faculty: (),
    EduPlanEntity.kafedra: (EduPlanEntity.faculty,),
    EduPlanEntity.speciality: (EduPlanEntity.kafedra,),
    EduPlanEntity.group: (EduPlanEntity.speciality,),
    # Reja bu yerda «ota» sifatida turadi, chunki `_with_dependencies` aynan
    # shu ro'yxat bo'yicha ko'zgudan `external_id -> id` xaritasini yig'adi —
    # usiz fan rejaga bog'lanmay qolardi (o'lchandi: 2958 satr yangilandi,
    # `curriculum_id` esa bittasida ham to'lmadi). Bog'liqliklar sinxronlanmaydi,
    # faqat o'qiladi, ya'ni fan progoni EPMOS'dan rejalarni tortmaydi.
    #
    # Bog'lanishning o'zi yumshoq: reja topilmasa, fan baribir saqlanadi
    # (`upsert_subject` ma'lum qiymatni o'chirmaydi).
    EduPlanEntity.subject: (EduPlanEntity.kafedra, EduPlanEntity.curriculum),
    EduPlanEntity.teacher: (EduPlanEntity.kafedra,),
    EduPlanEntity.curriculum: (EduPlanEntity.speciality,),
}


# ---------------------------------------------------------------------- #
#  Полезная нагрузка EduPlan
# ---------------------------------------------------------------------- #
class _Lenient(BaseModel):
    model_config = ConfigDict(extra="ignore")


class EduPlanFaculty(_Lenient):
    id: int
    name: str


class EduPlanDepartment(_Lenient):
    """EduPlan department — наша кафедра."""

    id: int
    name: str
    faculty_id: int


class EduPlanSpeciality(_Lenient):
    id: int
    name: str
    department_id: int
    education_type: Optional[str] = None


class EduPlanGroup(_Lenient):
    id: int
    name: str
    speciality_id: int
    course: Optional[int] = None
    student_count: Optional[int] = None
    education_shape: Optional[str] = None
    #: `uzbek` / `russian`. Kurs yig'ishda rus guruhlari alohida kursga
    #: ajratiladi.
    education_language: Optional[str] = None
    #: Та же группа в студенческом HEMIS. EPOS хранит эту связку сам, и до сих
    #: пор мы её просто выбрасывали — а потом восстанавливали голосованием по
    #: студентам и сопоставлением имён. Читаем как обычное зеркальное поле.
    hemis_id: Optional[str] = None


class EduPlanSubject(_Lenient):
    id: int
    name: str
    department_id: int
    #: Fan qaysi o'quv rejadan. EPMOS bir fanni har bir reja uchun alohida
    #: yozuv qilib beradi, ya'ni aynan shu maydon bir xil nomli yozuvlarni
    #: ajratadi. Ilgari `extra="ignore"` uni jimgina tashlab yuborardi.
    edu_plan_id: Optional[int] = None
    semester: Optional[str] = None


class EduPlanCurriculum(_Lenient):
    """Учебный план EPMOS (`/edu-plans/`).

    Кафедра и факультет в ответе не приходят — выводятся по цепочке
    специальность -> кафедра -> факультет, как и у группы.
    """

    id: int
    name: str
    speciality_id: int
    education_form: Optional[str] = None
    education_type: Optional[str] = None
    is_active: bool = True


class EduPlanTeacherProfile(_Lenient):
    id: int
    department_id: Optional[int] = None
    position: Optional[str] = None
    staff_type: Optional[str] = None


class EduPlanStaff(_Lenient):
    """Сотрудник EduPlan вместе с учётной записью.

    ``id`` — идентификатор пользователя EduPlan. Именно на него ссылается
    ``Workload.teacher_id``, поэтому он же и служит нашим external_id.
    """

    id: int
    username: str
    is_active: bool = True
    hemis_id: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    third_name: Optional[str] = None
    teacher: Optional[EduPlanTeacherProfile] = None

    @property
    def full_name(self) -> str:
        parts = [self.last_name, self.first_name, self.third_name]
        return " ".join(p.strip() for p in parts if p and p.strip())


class EduPlanAcademicYear(_Lenient):
    id: int
    name: str
    is_active: bool = False


class EduPlanStream(_Lenient):
    id: int
    name: str
    groups: list[dict[str, Any]] = Field(default_factory=list)

    @property
    def group_ids(self) -> list[int]:
        return [g["id"] for g in self.groups if isinstance(g, dict) and "id" in g]


class EduPlanWorkload(_Lenient):
    id: int
    load_type: Optional[str] = None
    semester_type: Optional[str] = None
    is_active: bool = True
    subject_id: Optional[int] = None
    group_id: Optional[int] = None
    stream_id: Optional[int] = None
    #: Идентификатор ПОЛЬЗОВАТЕЛЯ EduPlan, не преподавателя.
    teacher_id: Optional[int] = None
    academic_year_id: Optional[int] = None


# ---------------------------------------------------------------------- #
#  Предпросмотр
# ---------------------------------------------------------------------- #
class ProposalAction(str, Enum):
    create = "create"  # локального аналога нет — создать
    link = "link"  # нашли однозначного кандидата — связать и обновить
    update = "update"  # уже связано, поля разошлись
    unchanged = "unchanged"  # уже связано и совпадает
    conflict = "conflict"  # кандидатов несколько — решает администратор
    deactivate = "deactivate"  # было в зеркале, пропало в EduPlan


class Candidate(BaseModel):
    id: int
    name: str
    hint: Optional[str] = None


class Proposal(BaseModel):
    entity: EduPlanEntity
    action: ProposalAction
    external_id: str
    external_name: str
    local_id: Optional[int] = None
    candidates: list[Candidate] = Field(default_factory=list)
    changes: dict[str, Any] = Field(default_factory=dict)
    #: Почему предложение нельзя применить автоматически.
    note: Optional[str] = None

    @property
    def key(self) -> str:
        return f"{self.entity.value}:{self.external_id}"


class EntitySummary(BaseModel):
    entity: EduPlanEntity
    total_external: int = 0
    create: int = 0
    link: int = 0
    update: int = 0
    unchanged: int = 0
    conflict: int = 0
    deactivate: int = 0


class PreviewResponse(BaseModel):
    run_id: str
    generated_at: str
    #: Разделы, попавшие в этот предпросмотр. Применение работает ровно с
    #: ними: снимок замораживается вместе с выбором.
    entities: list[EduPlanEntity] = Field(default_factory=list)
    summary: list[EntitySummary]
    proposals: list[Proposal]
    #: Всё, что требует ручного решения, вынесено отдельно.
    requires_decision: int = 0


class Decision(BaseModel):
    """Решение администратора по одному предложению.

    ``local_id`` заполняется, когда администратор выбрал, с какой именно
    локальной строкой связать внешнюю.
    """

    key: str
    action: ProposalAction
    local_id: Optional[int] = None


class ApplyRequest(BaseModel):
    run_id: str
    decisions: list[Decision] = Field(default_factory=list)
    #: Применять ли предложения о деактивации пропавших строк.
    apply_deactivations: bool = False


class ApplyResult(BaseModel):
    entity: EduPlanEntity
    created: int = 0
    linked: int = 0
    updated: int = 0
    deactivated: int = 0
    skipped: int = 0
    errors: list[str] = Field(default_factory=list)


class ApplyResponse(BaseModel):
    run_id: str
    #: Разделы, к которым применение относилось.
    entities: list[EduPlanEntity] = Field(default_factory=list)
    results: list[ApplyResult]
    finished_at: str


class EntitySyncResponse(BaseModel):
    """Итог синхронизации одного раздела — то, что показывает его карточка."""

    entity: EduPlanEntity
    run_id: str
    finished_at: str
    #: Сколько строк пришло из EPMOS в этом прогоне.
    total_external: int = 0
    created: int = 0
    linked: int = 0
    updated: int = 0
    deactivated: int = 0
    skipped: int = 0
    #: Неоднозначные совпадения. Автоматически не применяются — их разбирают
    #: на общем экране сопоставления.
    requires_decision: int = 0
    errors: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------- #
#  Учётные данные сервисного аккаунта (вводятся в интерфейсе)
# ---------------------------------------------------------------------- #
class EduPlanSettingsIn(BaseModel):
    """Форма «Ulanish sozlamalari». Пустой ``password`` = оставить прежний."""

    base_url: Optional[str] = Field(default=None, max_length=255)
    username: str = Field(min_length=1, max_length=150)
    password: Optional[str] = Field(default=None, max_length=255)
    active_role: str = Field(default="", max_length=50)


class EduPlanSettingsOut(BaseModel):
    """Всё, что можно показать: пароль наружу не отдаётся никогда."""

    source: str  # "db" — введено в интерфейсе, "env" — из переменных окружения
    base_url: str
    username: str
    active_role: str
    has_password: bool
    enabled: bool
    updated_at: Optional[Any] = None


# ---------------------------------------------------------------------- #
#  Yuklamadan kurs yigʻish
# ---------------------------------------------------------------------- #
class CoursePlan(BaseModel):
    """Bitta kurs taklifi: fan + semestr + oʻqituvchi + mashgʻulot turi."""

    external_id: str
    #: Shu kalitli faol kurs allaqachon bor. Takroriy prognda qayta yaratilmaydi.
    exists: bool = False
    #: Kurs arxivda turibdi va yuklamada yana paydo boʻldi — qaytariladi.
    archived: bool = False

    subject_id: int
    subject_name: str
    teacher_user_id: int
    teacher_name: Optional[str] = None

    #: lecture | practice | lab. Seminar EPOS yuklamasida yoʻq.
    course_type: str

    semester_type: Optional[str] = None
    #: «Bahorgi, Kuzgi» birlashgan qiymatida semestr raqami boʻlmaydi.
    semester_number: Optional[int] = None
    academic_year_id: Optional[int] = None

    #: ``russian`` — rus guruhlari kursi. Oʻzbek guruhlarida ``None``.
    education_language: Optional[str] = None

    group_ids: list[int] = Field(default_factory=list)
    group_names: list[str] = Field(default_factory=list)


class CourseArchiveRow(BaseModel):
    """EPOS yuklamasida qolmagan kurs. Oʻchirilmaydi — arxivga oʻtadi."""

    course_id: int
    name: str
    course_type: Optional[str] = None
    teacher_name: Optional[str] = None
    group_names: list[str] = Field(default_factory=list)
    #: Adminga qaror uchun: darslari bor kursni arxivlash jurnalni yashiradi.
    lesson_count: int = 0


class CoursePreviewResponse(BaseModel):
    plans: list[CoursePlan] = Field(default_factory=list)
    #: Yuklamada qolmagan, arxivga tushishi mumkin boʻlgan kurslar.
    archive: list[CourseArchiveRow] = Field(default_factory=list)
    #: ``apply`` dan keyin haqiqatda oʻzgargan kurslar soni.
    created: int = 0
    restored: int = 0
    archived: int = 0
    #: Aralash kursdan rus kursiga koʻchirilgan guruhlar soni.
    moved_groups: int = 0
    #: Arxivlash chegaradan oshib ketdi — sabab odatda boʻsh yuklama.
    archive_blocked: bool = False

    @computed_field
    @property
    def summary(self) -> dict[str, int]:
        """Interfeys sarlavhasidagi sonlar."""
        existing = sum(1 for p in self.plans if p.exists)
        restorable = sum(1 for p in self.plans if p.archived)
        return {
            "total": len(self.plans),
            "existing": existing,
            "to_create": len(self.plans) - existing - restorable,
            "to_restore": restorable,
            "to_archive": len(self.archive),
        }

    @computed_field
    @property
    def by_type(self) -> dict[str, int]:
        """Turlar kesimi — sinxronizatsiya kartasidagi raqamlar."""
        counts: dict[str, int] = {}
        for plan in self.plans:
            counts[plan.course_type] = counts.get(plan.course_type, 0) + 1
        return counts
