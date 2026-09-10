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
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(
        from_attributes=True,
    )


class GroupListRequest(BaseModel):
    # Faqat adminda ishlaydi: boshqa rol yuborsa ham yashirilgan
    # yozuv koʻrinmaydi. Usiz admin oʻzi yashirganini qayta topa olmaydi.
    include_hidden: bool = False

    name: Optional[str] = None
    faculty_id: Optional[int] = None
    speciality_id: Optional[int] = None
    teacher_id: Optional[int] = None

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
    students: int = 0
    courses: int = 0
    workloads: int = 0
    lessons: int = 0
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
        return {
            "clusters": len(self.clusters),
            "to_archive": sum(len(c.merge) for c in self.clusters),
            "students_to_move": sum(row.students for c in self.clusters for row in c.merge),
            "courses_to_move": sum(row.courses for c in self.clusters for row in c.merge),
        }


class GroupMergeRequest(BaseModel):
    #: Boʻsh — hamma toʻda. Toʻdaning istalgan bitta guruhi koʻrsatilsa yetadi.
    group_ids: list[int] = Field(default_factory=list)


class GroupMergeResponse(BaseModel):
    clusters: int = 0
    archived: int = 0
    moved: dict[str, int] = Field(default_factory=dict)
