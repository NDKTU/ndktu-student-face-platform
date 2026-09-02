"""
POST /v1/face/verify — сверка одного кадра с эталонным фото.

Используется прокторингом Zoom-урока: основной бэкенд присылает кадр и
ссылку на эталон, решение принимает этот сервис.

Проверку намеренно делает сервер, а не браузер: результат «лицо совпало»
попадает в журнал посещаемости, и доверять его клиенту нельзя.
"""

from __future__ import annotations

import base64

from fastapi import APIRouter, Depends

from app.core.logging import get_logger
from app.core.security import verify_internal_token
from app.models.schemas import VerifyFaceRequest, VerifyFaceResponse
from app.services import reference_cache, video_service
from app.services.video_service import get_detector

router = APIRouter()
logger = get_logger(__name__)


@router.post(
    "/verify",
    response_model=VerifyFaceResponse,
    summary="Compare a single frame against a reference photo",
    dependencies=[Depends(verify_internal_token)],
)
async def verify_face(data: VerifyFaceRequest) -> VerifyFaceResponse:
    payload = data.image_base64
    if "," in payload:
        _, payload = payload.split(",", 1)

    try:
        frame = await video_service.decode_frame(base64.b64decode(payload))
    except Exception:  # noqa: BLE001 — битый base64 от клиента
        frame = None
    if frame is None:
        return VerifyFaceResponse(face_count=0, is_match=False, reference_ready=False, detail="invalid frame")

    face_count = await video_service.count_faces(frame)
    # Ноль или несколько лиц — сверять нечего, решение принимает бекенд.
    if face_count != 1:
        return VerifyFaceResponse(face_count=face_count, is_match=False, reference_ready=False)

    # Etalon dars davomida oʻzgarmaydi, tekshiruv esa har 5-12 daqiqada
    # takrorlanadi — shuning uchun vektor keshdan olinadi.
    reference_encoding = await reference_cache.get_encoding(data.reference_url)
    if reference_encoding is None:
        # Sabab ikki xil — rasm kelmadi yoki unda yuz topilmadi. Ikkalasida
        # ham qaror bir xil, batafsili jurnalda.
        return VerifyFaceResponse(
            face_count=face_count, is_match=False, reference_ready=False, detail="reference unavailable"
        )

    current_encoding = await video_service.get_face_encoding(frame)
    if current_encoding is None:
        return VerifyFaceResponse(face_count=face_count, is_match=False, reference_ready=True)

    is_match = get_detector().compare_faces(reference_encoding, current_encoding, tolerance=data.tolerance)
    return VerifyFaceResponse(face_count=face_count, is_match=bool(is_match), reference_ready=True)
