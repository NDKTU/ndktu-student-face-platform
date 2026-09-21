from datetime import date as Date
from typing import Dict, List, Optional

from pydantic import BaseModel

from app.core.schemas import TashkentDatetime


class GradebookHomework(BaseModel):
    id: int
    title: str
    max_grade: int
    deadline: TashkentDatetime


class GradebookQuiz(BaseModel):
    id: int
    title: str
    quiz_type: Optional[str] = None


class GradebookHomeworkCell(BaseModel):
    # `submitted` / `late` — tekshirilmagan, `graded` — baho qo'yilgan.
    status: str
    grade: Optional[int] = None
    submitted_at: Optional[TashkentDatetime] = None
    # Holatdan emas, vaqtdan: baho qo'yilganda holat `graded` ga o'tadi va
    # «kech» belgisi aks holda yo'qolardi.
    late: bool = False


class GradebookQuizCell(BaseModel):
    quiz_id: int
    grade: Optional[int] = None
    correct_answers: Optional[int] = None
    wrong_answers: Optional[int] = None
    cheating_detected: bool = False
    # Nechta yakunlangan urinish. Jurnalda oxirgisi ko'rsatiladi.
    attempts: int = 1


class GradebookRow(BaseModel):
    student_id: int
    user_id: Optional[int] = None
    full_name: str
    group_name: Optional[str] = None
    homework: Optional[GradebookHomeworkCell] = None
    quizzes: List[GradebookQuizCell] = []


class GradebookResponse(BaseModel):
    lesson_id: int
    homework: Optional[GradebookHomework] = None
    quizzes: List[GradebookQuiz] = []
    students: List[GradebookRow] = []


# ── Kurs baholash jurnali ─────────────────────────────────────────────────


class CourseGradebookGroup(BaseModel):
    id: int
    name: str
    student_count: int = 0


class CourseGradebookLesson(BaseModel):
    id: int
    topic: str
    date: Date
    homework: Optional[GradebookHomework] = None
    quizzes: List[GradebookQuiz] = []


class CourseGradebookRow(BaseModel):
    student_id: int
    full_name: str
    student_id_number: Optional[str] = None
    # Kalit — uy vazifasi / test id si. Ish topshirmagan yoki test
    # ishlamagan bo'lsa, kalit umuman bo'lmaydi.
    homeworks: Dict[int, GradebookHomeworkCell] = {}
    quizzes: Dict[int, GradebookQuizCell] = {}


class CourseGradebookResponse(BaseModel):
    course_id: int
    # Jurnal doim bitta guruh bo'yicha — qog'oz jurnal ham shunday.
    group_id: Optional[int] = None
    groups: List[CourseGradebookGroup] = []
    lessons: List[CourseGradebookLesson] = []
    # Darsga bog'lanmagan (kurs darajasidagi) uy vazifalari.
    course_homeworks: List[GradebookHomework] = []
    students: List[CourseGradebookRow] = []


# ── Talabaning o'z baholari ──────────────────────────────────────────────


class MyHomeworkGrade(BaseModel):
    id: int
    title: str
    max_grade: int
    deadline: TashkentDatetime
    # Ish topshirilmagan bo'lsa — None.
    status: Optional[str] = None
    grade: Optional[int] = None
    submitted_at: Optional[TashkentDatetime] = None
    late: bool = False
    # O'qituvchining baho bilan qoldirgan izohi — talaba nima uchun shu baho
    # olganini bilsin.
    feedback: Optional[str] = None


class MyQuizGrade(BaseModel):
    id: int
    title: str
    # Test ishlanmagan bo'lsa — None.
    grade: Optional[int] = None
    correct_answers: Optional[int] = None
    wrong_answers: Optional[int] = None
    attempts: int = 0


class MyGradesTopic(BaseModel):
    # Darssiz (kurs darajasidagi) vazifa uchun None.
    lesson_id: Optional[int] = None
    topic: str
    date: Optional[Date] = None
    homework: Optional[MyHomeworkGrade] = None
    quizzes: List[MyQuizGrade] = []


class MyGradesResponse(BaseModel):
    course_id: int
    topics: List[MyGradesTopic] = []
