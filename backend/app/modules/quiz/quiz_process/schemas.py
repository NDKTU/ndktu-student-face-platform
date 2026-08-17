from typing import Literal, Optional

from pydantic import BaseModel

ProctoringMode = Literal["face", "standard"]


class StartQuizRequest(BaseModel):
    quiz_id: int
    pin: str


class QuestionDTO(BaseModel):
    id: int
    text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str


class SubmittedAnswerDTO(BaseModel):
    question_id: int
    answer_index: int


class StartQuizResponse(BaseModel):
    result_id: int
    quiz_id: int
    title: str
    duration: int
    proctoring_mode: ProctoringMode
    questions: list[QuestionDTO]
    image_url: Optional[str] = None
    face_ws_token: Optional[str] = None

    #: Сколько секунд осталось до конца попытки. Считается от момента её создания
    #: на сервере, поэтому перезагрузка страницы не продлевает тест. Клиент ведёт
    #: таймер от этого значения, а не от `duration`.
    remaining_seconds: int = 0

    #: True, если это возвращение в уже начатую попытку, а не новая.
    resumed: bool = False

    #: Ответы, уже данные в этой попытке, — чтобы после сбоя студент увидел
    #: свои отметки, а не пустой бланк.
    submitted_answers: list[SubmittedAnswerDTO] = []


class SubmitAnswerRequest(BaseModel):
    result_id: int
    question_id: int

    #: Позиция выбранного варианта (0–3) в том порядке, в каком варианты были
    #: показаны студенту. Основной способ ответа: текст в проверке не участвует,
    #: поэтому одинаковые варианты, разные виды апострофа и HTML внутри варианта
    #: больше не влияют на оценку.
    answer_index: Optional[int] = None

    #: Текст выбранного варианта — путь совместимости для вкладок, открытых
    #: до выкатки. Новый клиент его не отправляет.
    answer: Optional[str] = None


class SubmitAnswerResponse(BaseModel):
    question_id: int
    is_correct: bool


class EndQuizRequest(BaseModel):
    quiz_id: int
    result_id: int
    cheating_detected: Optional[bool] = False
    reason: Optional[str] = None
    cheating_image_url: Optional[str] = None


class EndQuizResponse(BaseModel):
    total_questions: int
    correct_answers: int
    wrong_answers: int
    grade: int
    cheating_detected: Optional[bool] = False
    reason: Optional[str] = None


class UploadCheatingImageRequest(BaseModel):
    quiz_id: int
    user_id: Optional[int] = None
    image_data: str  # Base64 encoded JPEG


class UploadCheatingImageResponse(BaseModel):
    success: bool
    image_url: Optional[str] = None
    message: Optional[str] = None
