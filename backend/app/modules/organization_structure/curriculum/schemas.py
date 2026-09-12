from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.core.schemas import ExternalRefFields, TashkentDatetime


class CurriculumResponse(ExternalRefFields):
    """Учебный план — зеркало EPMOS, руками не заводится и не правится."""

    id: int
    name: str
    speciality_id: Optional[int] = None
    kafedra_id: Optional[int] = None
    faculty_id: Optional[int] = None
    #: EPMOS EducationForm: Kunduzgi | Kechki | Sirtqi
    education_form: Optional[str] = None
    #: EPMOS EducationType: Bakalavr | Magistr
    education_type: Optional[str] = None
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(from_attributes=True)


class CurriculumListRequest(BaseModel):
    # Faqat adminda ishlaydi: boshqa rol yuborsa ham yashirilgan
    # yozuv koʻrinmaydi.
    # Yashirish funksiyasi 2026-09-11 da kommentga olindi (`core/utils/visibility.py` ga qarang).
    # include_hidden: bool = False

    name: Optional[str] = None
    speciality_id: Optional[int] = None
    kafedra_id: Optional[int] = None
    faculty_id: Optional[int] = None
    education_form: Optional[str] = None
    education_type: Optional[str] = None
    page: int = 1
    limit: int = 20

    @property
    def offset(self) -> int:
        if self.page < 1:
            return 0
        return (self.page - 1) * self.limit


class CurriculumListResponse(BaseModel):
    total: int
    page: int
    limit: int
    curriculums: list[CurriculumResponse]
