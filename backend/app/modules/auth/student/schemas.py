from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict

from app.core.schemas import TashkentDatetime


class StudentBase(BaseModel):
    first_name: str
    last_name: str
    third_name: str
    full_name: str
    student_id_number: str
    image_path: str
    birth_date: date
    phone: Optional[str] = None
    gender: str
    university: str
    specialty: str
    student_status: str
    education_form: str
    education_type: str
    payment_form: str
    education_lang: str
    faculty: str
    level: str
    semester: str
    address: str
    avg_gpa: float
    user_id: Optional[int] = None
    group_id: Optional[int] = None


class StudentCreateRequest(StudentBase):
    pass


class StudentUpdateRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    third_name: Optional[str] = None
    full_name: Optional[str] = None
    student_id_number: Optional[str] = None
    image_path: Optional[str] = None
    birth_date: Optional[date] = None
    phone: Optional[str] = None
    gender: Optional[str] = None
    university: Optional[str] = None
    specialty: Optional[str] = None
    student_status: Optional[str] = None
    education_form: Optional[str] = None
    education_type: Optional[str] = None
    payment_form: Optional[str] = None
    education_lang: Optional[str] = None
    faculty: Optional[str] = None
    level: Optional[str] = None
    semester: Optional[str] = None
    address: Optional[str] = None
    avg_gpa: Optional[float] = None
    user_id: Optional[int] = None
    group_id: Optional[int] = None


class StudentResponse(StudentBase):
    id: int
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(from_attributes=True)


class StudentListRequest(BaseModel):
    page: int = 1
    limit: int = 10
    search: str | None = None
    user_id: int | None = None
    group_id: int | None = None

    #: name | user_id | created_at. Saralash serverda: sahifa ichida
    #: tartiblash butun ro'yxatni tartibsiz qoldirardi.
    sort_by: str | None = None
    order: str = "asc"

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.limit


class StudentListResponse(BaseModel):
    total: int
    page: int
    limit: int
    students: list[StudentResponse]


class UserInfoResponse(BaseModel):
    id: int
    username: str
    is_active: bool
    created_at: TashkentDatetime
    updated_at: TashkentDatetime

    model_config = ConfigDict(from_attributes=True)


class StudentWithUserResponse(BaseModel):
    student_id: int
    user_id: Optional[int]
    username: Optional[str]
    is_active: Optional[bool]
    first_name: str
    last_name: str
    full_name: str
    student_id_number: str
    phone: Optional[str]
    gender: str
    faculty: str
    level: str
    semester: str
    specialty: str
    student_status: str
    avg_gpa: float
    group_id: Optional[int]
    created_at: TashkentDatetime
    updated_at: TashkentDatetime


class StudentWithUserListResponse(BaseModel):
    total: int
    page: int
    limit: int
    students: list[StudentWithUserResponse]


# ── Talaba dashboardi ─────────────────────────────────────────────────────────


class StudentDashboardProfile(BaseModel):
    group_id: Optional[int] = None
    group_name: Optional[str] = None
    level: Optional[str] = None
    semester: Optional[str] = None
    specialty: Optional[str] = None
    faculty: Optional[str] = None
    avg_gpa: Optional[float] = None


class StudentDashboardTotals(BaseModel):
    courses: int = 0
    #: Bugundan boshlab rejalashtirilgan darslar.
    upcoming_lessons: int = 0
    #: Muddati oʻtmagan va hali topshirilmagan vazifalar.
    homeworks_pending: int = 0
    #: Topshirilgan, baholanishi kutilayotganlar.
    homeworks_submitted: int = 0
    homeworks_graded: int = 0
    #: Muddati oʻtib ketgan va topshirilmagan vazifalar.
    homeworks_missed: int = 0
    #: Yakunlangan testlar.
    quizzes_taken: int = 0


class StudentDashboardAttendanceCourse(BaseModel):
    course_id: int
    course_name: str
    percent: Optional[float] = None
    absent: int = 0


class StudentDashboardAttendance(BaseModel):
    present: int = 0
    late: int = 0
    absent: int = 0
    excused: int = 0
    #: `None` — jurnal hali toʻldirilmagan (0% bilan bir xil emas).
    percent: Optional[float] = None
    courses: list[StudentDashboardAttendanceCourse] = []


class StudentDashboardGrades(BaseModel):
    """Test baholari taqsimoti (2–5) va oʻrtachasi, uy vazifalari oʻrtacha foizi."""

    avg_grade: Optional[float] = None
    grade_5: int = 0
    grade_4: int = 0
    grade_3: int = 0
    grade_2: int = 0
    #: Uy vazifasi baholari `max_grade` ga nisbatan foizda: vazifalarning
    #: shkalasi har xil boʻlishi mumkin.
    homework_percent: Optional[float] = None


class StudentDashboardLesson(BaseModel):
    id: int
    topic: str
    date: str
    lesson_type: Optional[str] = None
    course_id: int
    course_name: str


class StudentDashboardHomework(BaseModel):
    id: int
    title: str
    deadline: TashkentDatetime
    course_id: int
    course_name: str
    lesson_id: Optional[int] = None


class StudentDashboardResult(BaseModel):
    id: int
    quiz_title: Optional[str] = None
    subject_name: Optional[str] = None
    grade: Optional[int] = None
    correct_answers: Optional[int] = None
    wrong_answers: Optional[int] = None
    finished_at: Optional[TashkentDatetime] = None


class StudentDashboardResponse(BaseModel):
    profile: StudentDashboardProfile
    totals: StudentDashboardTotals
    attendance: StudentDashboardAttendance
    grades: StudentDashboardGrades
    upcoming_lessons: list[StudentDashboardLesson] = []
    homeworks: list[StudentDashboardHomework] = []
    recent_results: list[StudentDashboardResult] = []
