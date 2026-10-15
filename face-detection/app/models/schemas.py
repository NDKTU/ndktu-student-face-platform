from pydantic import BaseModel


class AnalyzeVideoResponse(BaseModel):
    """Response for POST /v1/video/analyze"""

    has_two_faces: bool


class ErrorResponse(BaseModel):
    """Generic error envelope"""

    error: str


class VerifyFaceRequest(BaseModel):
    """Request for POST /v1/face/verify"""

    # Kadr — base64 JPEG (data:image/jpeg;base64,... prefiksi bilan ham bo'ladi).
    image_base64: str
    # Etalon: /uploads/... (mahalliy volume) yoki tashqi havola (HEMIS).
    reference_url: str
    # Solishtirish qat'iyligi. Kichikroq qiymat — qat'iyroq.
    tolerance: float = 0.5


class VerifyFaceResponse(BaseModel):
    """Response for POST /v1/face/verify"""

    face_count: int
    is_match: bool
    # Etalon fotoda yuz topilmagan bo'lsa `False` — bu talabaning aybi emas.
    reference_ready: bool
    detail: str | None = None
    # Jonlilik: tirik yuz ehtimoli (0..1) va chegara bo'yicha xulosa.
    # `None` — baholanmadi (yuz bitta emas, model o'chiq). Qarorni bekend
    # qiladi: `log` rejimida faqat jurnalga yozadi, `enforce` da rad etadi.
    liveness_score: float | None = None
    is_live: bool | None = None
