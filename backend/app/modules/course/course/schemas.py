from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.core.schemas import TashkentDatetime

#: Kursning mashg'ulot turi. EPOS yuklamasi `lecture`, `practice`, `lab`
#: beradi; `seminar` unda yo'q va faqat qo'lda yaratiladi.
COURSE_TYPE_VALUES = Literal["lecture", "practice", "lab", "seminar"]


class CourseSubjectInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class CourseTeacherInfo(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class CourseGroupInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class CourseFacultyInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class CourseKafedraInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class CourseSpecialityInfo(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class CourseCreateRequest(BaseModel):
    # Название собирается на сервере из предмета, групп, типа и семестра. Поле
    # осталось необязательным ради старых клиентов: присланное имя имеет приоритет.
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    subject_id: int
    teacher_id: int
    #: Majburiy: kurs endi «fan + semestr + o'qituvchi + tur» to'rtligi.
    course_type: COURSE_TYPE_VALUES
    description: Optional[str] = None
    semester_number: Optional[int] = Field(default=None, ge=1, le=2)
    group_ids: List[int] = Field(default_factory=list)
    faculty_id: Optional[int] = None
    kafedra_id: Optional[int] = None
    speciality_id: Optional[int] = None


class CourseUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    subject_id: Optional[int] = None
    teacher_id: Optional[int] = None
    course_type: Optional[COURSE_TYPE_VALUES] = None
    description: Optional[str] = None
    semester_number: Optional[int] = Field(default=None, ge=1, le=2)
    group_ids: Optional[List[int]] = None
    faculty_id: Optional[int] = None
    kafedra_id: Optional[int] = None
    speciality_id: Optional[int] = None


class CourseResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    subject_id: int
    teacher_id: int
    course_type: Optional[str] = None
    semester_number: Optional[int] = None
    faculty_id: Optional[int] = None
    kafedra_id: Optional[int] = None
    speciality_id: Optional[int] = None
    #: False — kurs arxivda: EPOS yuklamasida endi yo'q.
    is_active: bool = True
    subject: Optional[CourseSubjectInfo] = None
    teacher: Optional[CourseTeacherInfo] = None
    faculty: Optional[CourseFacultyInfo] = None
    kafedra: Optional[CourseKafedraInfo] = None
    speciality: Optional[CourseSpecialityInfo] = None
    groups: List[CourseGroupInfo] = []
    lesson_count: int = 0
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(from_attributes=True)


class CourseListRequest(BaseModel):
    teacher_id: Optional[int] = None
    subject_id: Optional[int] = None
    group_id: Optional[int] = None
    course_type: Optional[COURSE_TYPE_VALUES] = None
    #: Yuborilmasa — faqat faol kurslar. `false` — arxiv. Aralash ro'yxat
    #: ataylab yo'q: arxivdagi kurs faol kurslar orasida chalkashtiradi.
    is_active: Optional[bool] = None
    semester_number: Optional[int] = None
    faculty_id: Optional[int] = None
    kafedra_id: Optional[int] = None
    speciality_id: Optional[int] = None
    #: Fan, o'qituvchi, guruh yoki kurs nomi bo'yicha qidiruv. Serverda:
    #: ilgari front faqat ochilgan sahifani qidirar, ikkinchi sahifadagi kurs
    #: esa «topilmadi» bo'lib qolardi.
    search: Optional[str] = None

    #: subject | teacher | semester | type. Saralash ham serverda — aks holda
    #: tartib faqat sahifa ichida ishlardi.
    sort_by: Optional[str] = None
    order: str = "asc"

    page: int = 1
    limit: int = 20

    @property
    def offset(self) -> int:
        if self.page < 1:
            return 0
        return (self.page - 1) * self.limit


class CourseListResponse(BaseModel):
    total: int
    page: int
    limit: int
    courses: List[CourseResponse]


class CourseTeacherSummary(BaseModel):
    teacher_id: int
    username: str
    full_name: Optional[str] = None
    kafedra_id: Optional[int] = None
    kafedra_name: Optional[str] = None
    course_count: int
    lesson_count: int


class CourseTeacherSummaryResponse(BaseModel):
    teachers: List[CourseTeacherSummary]


class CourseTeacherRow(BaseModel):
    """Kurs oʻqituvchisi: asosiy yoki assistent."""

    model_config = ConfigDict(from_attributes=True)

    user_id: int
    username: str
    full_name: Optional[str] = None
    role: str


class CourseTeachersResponse(BaseModel):
    teachers: List[CourseTeacherRow]


class CourseTeacherAddRequest(BaseModel):
    user_id: int
    #: Hozircha faqat "assistant". Asosiy oʻqituvchini almashtirish alohida
    #: amal: u kursni, darslarni va baholarni boshqa odamga berish demakdir.
    role: Literal["assistant"] = "assistant"
