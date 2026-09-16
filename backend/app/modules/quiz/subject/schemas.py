from typing import Optional

from pydantic import BaseModel, ConfigDict, field_validator

from app.core.schemas import ExternalRefFields, TashkentDatetime


class SubjectCreateRequest(BaseModel):
    name: str

    @field_validator("name", mode="before")
    @classmethod
    def name_must_not_be_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip().lower()


class SubjectCurriculumInfo(BaseModel):
    """O'quv rejaning ro'yxat uchun yetarli qismi."""

    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class SubjectCreateResponse(ExternalRefFields):
    id: int
    name: str
    #: O'quv reja — bir xil nomli fanlarni aynan shu ajratadi. EPMOS bitta
    #: fanni har bir reja uchun alohida yozuv qilib beradi («Akademik yozuv»
    #: to'rt marta), kafedra esa to'rtoviniki ham bitta. Qo'lda kiritilgan
    #: fanlarda `None`.
    curriculum_id: Optional[int] = None
    curriculum: Optional[SubjectCurriculumInfo] = None
    #: «kuzgi» / «bahorgi» — bitta reja ichidagi takrorlarni ajratadi.
    semester: Optional[str] = None
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(
        from_attributes=True,
    )


class SubjectListRequest(BaseModel):
    # Yashirish funksiyasi 2026-09-11 da kommentga olindi (`core/utils/visibility.py` ga qarang).
    # Faqat adminda ishlaydi: boshqa rol yuborsa ham yashirilgan
    # yozuv koʻrinmaydi. Usiz admin oʻzi yashirganini qayta topa olmaydi.
    # include_hidden: bool = False

    name: Optional[str] = None

    #: id | name | created_at. Saralash serverda: sahifa ichida tartiblash
    #: butun ro'yxatni tartibsiz qoldirardi.
    sort_by: Optional[str] = None
    order: str = "asc"

    page: int = 1

    teacher_id: Optional[int] = None
    limit: int = 10

    @property
    def offset(self) -> int:
        if self.page < 1:
            return 0
        return (self.page - 1) * self.limit


class SubjectListResponse(BaseModel):
    total: int
    page: int
    limit: int
    subjects: list[SubjectCreateResponse]
