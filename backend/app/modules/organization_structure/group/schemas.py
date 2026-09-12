from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator

from app.core.schemas import ExternalRefFields, TashkentDatetime


class GroupCreateRequest(BaseModel):
    name: str
    faculty_id: int

    @field_validator("name", mode="before")
    @classmethod
    def name_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip()


class GroupCreateResponse(ExternalRefFields):
    id: int
    name: str
    faculty_id: int
    speciality_id: Optional[int] = None
    course: Optional[int] = None
    education_shape: Optional[str] = None
    student_count: Optional[int] = None

    #: Guruhning EPMOS'dagi identifikatori (`external_id`). Interfeys uni
    #: «EPMOS ID» deb koʻrsatadi — ilgari u yerda bizning lokal `id` turardi
    #: va «HEMIS kodi» deb atalardi, yaʼni ikki xato bir joyda edi.
    external_id: Optional[str] = None
    #: Oʻsha guruhning talabalar HEMIS'idagi identifikatori. EPMOS bu
    #: bogʻlanishni oʻzi saqlaydi va biz uni koʻzgudek olamiz.
    hemis_group_id: Optional[str] = None

    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(
        from_attributes=True,
    )


class GroupListRequest(BaseModel):
    # Yashirish funksiyasi 2026-09-11 da kommentga olindi (`core/utils/visibility.py` ga qarang).
    # Faqat adminda ishlaydi: boshqa rol yuborsa ham yashirilgan
    # yozuv koʻrinmaydi. Usiz admin oʻzi yashirganini qayta topa olmaydi.
    # include_hidden: bool = False

    name: Optional[str] = None
    faculty_id: Optional[int] = None
    speciality_id: Optional[int] = None
    teacher_id: Optional[int] = None

    #: Kurs (1..4) va ta'lim shakli — ro'yxat ekranidagi filtrlar. Ular
    #: serverda qo'llanadi: ilgari front faqat ochilgan sahifani filtrlardi,
    #: shuning uchun «1-kurs» 683 tadan 15 tasini ko'rib, uchtasini
    #: ko'rsatardi va sahifalar bo'm-bo'sh chiqardi.
    course: Optional[int] = None
    #: EPOS satrining yozilishi turlicha ("Kunduzgi"/"kunduzgi"), shuning
    #: uchun taqqoslash registrga bog'liq emas.
    education_shape: Optional[str] = None

    #: name | course | student_count. Saralash ham serverda: aks holda
    #: tartib faqat ochilgan sahifa ichida ishlardi.
    sort_by: Optional[str] = None
    order: str = "asc"

    page: int = 1

    limit: int = 10

    @property
    def offset(self) -> int:
        if self.page < 1:
            return 0
        return (self.page - 1) * self.limit


class GroupListResponse(BaseModel):
    total: int
    page: int
    limit: int
    groups: list[GroupCreateResponse]


# ---------------------------------------------------------------------- #
#  Takrorlangan guruhlarni birlashtirish
# ---------------------------------------------------------------------- #
class GroupMergeRow(BaseModel):
    """Toʻdadagi bitta guruh qatori."""

    group_id: int
    name: str
    external_id: Optional[str] = None
    synced_at: Optional[TashkentDatetime] = None
    hemis_group_id: Optional[str] = None
    #: Bogʻlangan yozuvlar — admin nimani yoʻqotmasligini koʻrsin uchun.
    #: Hammasi qoladigan nusxaga koʻchadi, hech biri oʻchirilmaydi.
    students: int = 0
    courses: int = 0
    workloads: int = 0
    lessons: int = 0
    quizzes: int = 0
    results: int = 0
    #: True — shu qator qoladi, qolganlari unga qoʻshiladi.
    keep: bool = False


class GroupDuplicateCluster(BaseModel):
    name: str
    faculty_id: Optional[int] = None
    keep: GroupMergeRow
    merge: list[GroupMergeRow] = Field(default_factory=list)


class GroupDuplicatePreview(BaseModel):
    clusters: list[GroupDuplicateCluster] = Field(default_factory=list)

    @computed_field
    @property
    def summary(self) -> dict[str, int]:
        moved = lambda field: sum(  # noqa: E731 — qisqa yordamchi, faqat shu yerda
            getattr(row, field) for c in self.clusters for row in c.merge
        )
        return {
            "clusters": len(self.clusters),
            "to_archive": len([row for c in self.clusters for row in c.merge]),
            "students_to_move": moved("students"),
            "courses_to_move": moved("courses"),
            "quizzes_to_move": moved("quizzes"),
            "results_to_move": moved("results"),
        }


class GroupMergeRequest(BaseModel):
    #: Boʻsh — hamma toʻda. Toʻdaning istalgan bitta guruhi koʻrsatilsa yetadi.
    group_ids: list[int] = Field(default_factory=list)


class GroupMergeResponse(BaseModel):
    clusters: int = 0
    archived: int = 0
    moved: dict[str, int] = Field(default_factory=dict)
