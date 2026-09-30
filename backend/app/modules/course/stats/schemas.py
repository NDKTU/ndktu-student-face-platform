from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from app.modules.course.course.schemas import COURSE_TYPE_VALUES


class CourseStatsRequest(BaseModel):
    faculty_id: Optional[int] = None
    kafedra_id: Optional[int] = None
    course_type: Optional[COURSE_TYPE_VALUES] = None
    #: O'qish semestri (1–10), kuzgi/bahorgi emas — jadvalda aynan u turadi.
    semester: Optional[int] = Field(default=None, ge=1, le=12)
    #: Bakalavr | Magistr
    education_type: Optional[str] = None
    #: Kunduzgi | Sirtqi | Kechki | Masofaviy
    education_form: Optional[str] = None
    #: `empty` — mavzu, resurs va topshiriq yo'q kurslar; `filled` — aksi.
    fill: Optional[Literal["filled", "empty"]] = None
    #: Fan, o'quv reja yoki kafedra nomi bo'yicha.
    search: Optional[str] = None

    #: kafedra | subject | semester | topics | resources | homeworks
    sort_by: Optional[str] = None
    order: str = "asc"

    page: int = Field(default=1, ge=1)
    limit: int = Field(default=20, ge=1, le=100)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.limit


class CourseStatsRow(BaseModel):
    course_id: int
    #: To'liq nom guruhlar bilan: jadvalda bir xil ko'rinadigan ikki kursni
    #: (fan, tur va semestr bir xil, guruh boshqa) ajratish uchun.
    course_name: str
    kafedra_name: Optional[str] = None
    #: Kafedraning fakulteti — «Kafedra / Bo'lim» ustunidagi ikkinchi qator.
    faculty_name: Optional[str] = None
    subject_name: str
    curriculum_name: Optional[str] = None
    education_type: Optional[str] = None
    education_form: Optional[str] = None
    course_type: Optional[str] = None
    #: 1 — kuzgi, 2 — bahorgi.
    semester_number: Optional[int] = None
    #: O'qish semestri: guruh kursi va kuzgi/bahorgidan. Guruhsiz kursda bo'sh.
    study_semester: Optional[int] = None
    topic_count: int
    resource_count: int
    homework_count: int


class CourseStatsSummary(BaseModel):
    course_count: int
    topic_count: int
    resource_count: int
    homework_count: int
    #: Mavzu, resurs va topshirig'i yo'q kurslar.
    empty_course_count: int


class CourseStatsResponse(BaseModel):
    total: int
    page: int
    limit: int
    summary: CourseStatsSummary
    rows: List[CourseStatsRow]
