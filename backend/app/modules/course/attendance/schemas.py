from datetime import date as date_type
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict

from app.core.schemas import TashkentDatetime

#: `excused` — sababli. Ataylab alohida: u foizni buzmasligi kerak, lekin
#: talaba shunchaki yo'qolib qolgani ham ko'rinib tursin.
ATTENDANCE_STATUSES = Literal["present", "absent", "late", "excused"]

ATTENDANCE_SOURCES = Literal["manual", "face_check"]


class AttendanceGroupInfo(BaseModel):
    id: int
    name: str
    student_count: int = 0
    #: Nechtasi belgilangan — o'qituvchi qaysi guruh qolganini ko'rsin.
    marked_count: int = 0


class AttendanceRow(BaseModel):
    student_id: int
    full_name: str
    student_id_number: Optional[str] = None
    group_id: Optional[int] = None
    group_name: Optional[str] = None
    #: Bo'sh — hali belgilanmagan. Bu «kelmadi» degani emas.
    status: Optional[ATTENDANCE_STATUSES] = None
    source: Optional[ATTENDANCE_SOURCES] = None
    comment: Optional[str] = None
    marked_by_user_id: Optional[int] = None
    marked_at: Optional[TashkentDatetime] = None

    model_config = ConfigDict(from_attributes=True)


class AttendanceListResponse(BaseModel):
    lesson_id: int
    lesson_date: date_type
    #: Tanlangan guruh. Oqim darsida guruh tanlanmaguncha bo'sh.
    group_id: Optional[int] = None
    groups: List[AttendanceGroupInfo] = []
    #: True — dars bir nechta guruhniki, ro'yxat uchun guruh tanlash shart.
    group_required: bool = False
    #: Jurnal hali ochiqmi (`APP_CONFIG__ATTENDANCE__EDIT_WINDOW_DAYS`).
    is_editable: bool = True
    #: Shu sanadan keyin jurnal yopiladi. Bo'sh — cheklov o'chirilgan.
    locked_after: Optional[date_type] = None
    students: List[AttendanceRow] = []
    #: Foiz: (present + late) / (present + late + absent). `excused` maxrajga
    #: kirmaydi, belgilanmaganlar ham.
    present_count: int = 0
    late_count: int = 0
    absent_count: int = 0
    excused_count: int = 0
    unmarked_count: int = 0


class AttendanceMarkItem(BaseModel):
    student_id: int
    #: `null` — belgini olib tashlash (jurnal qatori o'chadi).
    status: Optional[ATTENDANCE_STATUSES] = None
    comment: Optional[str] = None


class AttendanceBulkRequest(BaseModel):
    #: Oqim darsida qaysi guruh belgilanayotgani — javobni o'sha guruh bo'yicha
    #: qaytarish uchun. Tekshiruvga ta'sir qilmaydi: har bir talaba baribir
    #: darsning guruhlariga tegishli ekani alohida tekshiriladi.
    group_id: Optional[int] = None
    items: List[AttendanceMarkItem]


# ── Statistika ────────────────────────────────────────────────────────────────


class AttendanceStats(BaseModel):
    """Bitta talabaning davomat ko'rsatkichi.

    Foiz: (present + late) / (present + late + absent). `excused` maxrajga
    kirmaydi — sababli qoldirilgan dars ko'rsatkichni buzmasligi kerak, lekin
    alohida ko'rinib turadi. Belgilanmagan darslar ham hisobga olinmaydi.
    """

    student_id: int
    present: int = 0
    late: int = 0
    absent: int = 0
    excused: int = 0
    #: Foizni hisoblashda qatnashgan darslar soni (present + late + absent).
    counted: int = 0
    #: `null` — hali biror dars belgilanmagan, foiz yo'q (0% emas).
    percent: Optional[float] = None


class AttendanceStatsResponse(BaseModel):
    students: List[AttendanceStats] = []


# ── Kurs jurnali (matritsa) ───────────────────────────────────────────────────


class CourseAttendanceLesson(BaseModel):
    id: int
    topic: str
    date: date_type
    lesson_type: Optional[str] = None


class CourseAttendanceStudent(BaseModel):
    student_id: int
    full_name: str
    student_id_number: Optional[str] = None
    #: dars id -> holat. JSON'da kalitlar satrga aylanadi.
    marks: dict[int, ATTENDANCE_STATUSES] = {}
    stats: AttendanceStats


class CourseAttendanceResponse(BaseModel):
    course_id: int
    group_id: Optional[int] = None
    groups: List[AttendanceGroupInfo] = []
    group_required: bool = False
    lessons: List[CourseAttendanceLesson] = []
    students: List[CourseAttendanceStudent] = []


# ── Talabaning o'z davomati ───────────────────────────────────────────────────


class MyAttendanceCourse(BaseModel):
    course_id: int
    course_name: str
    subject_name: Optional[str] = None
    present: int = 0
    late: int = 0
    absent: int = 0
    excused: int = 0
    percent: Optional[float] = None


class MyAttendanceItem(BaseModel):
    lesson_id: int
    lesson_date: date_type
    lesson_topic: str
    course_id: int
    course_name: str
    status: ATTENDANCE_STATUSES
    comment: Optional[str] = None


class MyAttendanceResponse(BaseModel):
    student_id: int
    group_id: Optional[int] = None
    group_name: Optional[str] = None
    present: int = 0
    late: int = 0
    absent: int = 0
    excused: int = 0
    percent: Optional[float] = None
    courses: List[MyAttendanceCourse] = []
    #: Faqat kelmagan/kechikkan/sababli darslar — «qaerda yo'qotdim» savoliga
    #: javob. Kelgan darslarni sanab chiqishning ma'nosi yo'q.
    misses: List[MyAttendanceItem] = []
