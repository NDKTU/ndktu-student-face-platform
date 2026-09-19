from datetime import date as Date
from typing import List, Optional

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


# ── Talabaning o'z baholari ──────────────────────────────────────────────


class MyHomeworkGrade(BaseModel):
    id: int
    title: str
    max_grade: int
    deadline: TashkentDatetime
    # Ish topshirilmagan bo'lsa — None.
    status: Optional[str] = None
    grade: Optional[int] = None
    late: bool = False


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
