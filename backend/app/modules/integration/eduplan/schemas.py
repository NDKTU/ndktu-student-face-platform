"""Схемы обмена с EduPlan и схемы предпросмотра/применения синхронизации.

Модели EduPlan описаны нестрого (``extra="ignore"``): их API живёт своей
жизнью, и появление новых полей на той стороне не должно ронять наш прогон.
Персональные данные (passport_serial, jshshir, phone_number) здесь намеренно
не объявлены — то, что не описано, до нашей базы не доедет.
"""

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class EduPlanEntity(str, Enum):
    """Сущности, которые зеркалим. Значение = ключ в отчётах и решениях."""

    faculty = "faculty"
    kafedra = "kafedra"
    department = "department"
    speciality = "speciality"
    group = "group"
    subject = "subject"
    employee = "employee"


#: Порядок обхода. Ребёнок не может примениться раньше родителя: кафедра
#: требует факультет, специальность — кафедру, группа — специальность.
SYNC_ORDER: tuple[EduPlanEntity, ...] = (
    EduPlanEntity.faculty,
    EduPlanEntity.kafedra,
    EduPlanEntity.department,
    EduPlanEntity.speciality,
    EduPlanEntity.group,
    EduPlanEntity.subject,
    EduPlanEntity.employee,
)


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


class EduPlanSection(_Lenient):
    """EduPlan section — наш административный отдел."""

    id: int
    name: str


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


class EduPlanSubject(_Lenient):
    id: int
    name: str
    department_id: int
    credits: Optional[int] = None


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
    results: list[ApplyResult]
    finished_at: str
