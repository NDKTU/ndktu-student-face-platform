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


class StartQuizResponse(BaseModel):
    result_id: int
    quiz_id: int
    title: str
    duration: int
    proctoring_mode: ProctoringMode
    questions: list[QuestionDTO]
    image_url: Optional[str] = None
    face_ws_token: Optional[str] = None


class SubmitAnswerRequest(BaseModel):
    result_id: int
    question_id: int
    answer: str


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
