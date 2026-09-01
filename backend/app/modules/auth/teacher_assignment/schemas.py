from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class AssignmentRow(BaseModel):
    """Yuklamaning bitta qatori: kim, qaysi guruhga, qaysi fandan.

    Nomlar bilan birga qaytariladi — jadvalda id koʻrsatishning maʼnosi yoʻq,
    frontend esa uch marta qoʻshimcha soʻrov yubormasligi kerak.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int

    teacher_id: int
    teacher_name: str

    subject_id: int
    subject_name: str

    group_id: int
    group_name: str

    kafedra_id: Optional[int] = None
    kafedra_name: Optional[str] = None

    #: Mashgʻulot turlari (maʼruza, amaliyot, laboratoriya). EPOS ularni
    #: bermasligi mumkin — unda roʻyxat boʻsh boʻladi.
    load_types: List[str] = Field(default_factory=list)
    semester_type: Optional[str] = None
    academic_year_id: Optional[int] = None

    is_active: bool = True


class AssignmentListRequest(BaseModel):
    teacher_id: Optional[int] = None
    subject_id: Optional[int] = None
    group_id: Optional[int] = None
    kafedra_id: Optional[int] = None
    load_type: Optional[str] = None

    #: Oʻqituvchi, fan yoki guruh nomi boʻyicha.
    search: Optional[str] = None

    #: EPOS'dan yoʻqolgan biriktirmalar oʻchirilmaydi, nofaol qilinadi —
    #: odatda ular koʻrsatilmaydi, lekin tekshirish uchun kerak boʻlishi mumkin.
    include_inactive: bool = False

    page: int = Field(default=1, ge=1)
    limit: int = Field(default=50, ge=1, le=500)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.limit


class AssignmentListResponse(BaseModel):
    items: List[AssignmentRow]
    total: int
    page: int
    limit: int
