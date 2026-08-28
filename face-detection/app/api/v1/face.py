"""
POST /v1/face/verify — сверка одного кадра с эталонным фото.

Используется прокторингом Zoom-урока: основной бэкенд присылает кадр и
ссылку на эталон, решение принимает этот сервис.

Проверку намеренно делает сервер, а не браузер: результат «лицо совпало»
попадает в журнал посещаемости, и доверять его клиенту нельзя.
"""

from __future__ import annotations

import base64
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends

from app.core.logging import get_logger
from app.core.security import verify_internal_token
from app.models.schemas import VerifyFaceRequest, VerifyFaceResponse
from app.services import video_service
from app.services.video_service import get_detector

router = APIRouter()
logger = get_logger(__name__)

# Эталон берётся либо из смонтированного тома (/uploads/...), либо по внешней
# ссылке (HEMIS отдаёт фото студентов именно так).
_LOCAL_PREFIX = "/uploads/"
_LOCAL_ROOT = "/face"


async def _load_reference_bytes(reference_url: str) -> bytes | None:
    if reference_url.startswith(_LOCAL_PREFIX):
        path = Path(f"{_LOCAL_ROOT}{reference_url}")
        return path.read_bytes() if path.exists() else None
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(reference_url, timeout=10.0)
            response.raise_for_status()
            return response.content
    except Exception as cause:  # noqa: BLE001 — сеть/битый файл: причина в логе, ответ ниже
        logger.warning("Reference image download failed (%s): %s", reference_url, cause)
        return None


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

    reference_bytes = await _load_reference_bytes(data.reference_url)
    if reference_bytes is None:
        return VerifyFaceResponse(
            face_count=face_count, is_match=False, reference_ready=False, detail="reference unavailable"
        )

    reference_frame = await video_service.decode_frame(reference_bytes)
    reference_encoding = await video_service.get_face_encoding(reference_frame) if reference_frame is not None else None
    if reference_encoding is None:
        return VerifyFaceResponse(
            face_count=face_count, is_match=False, reference_ready=False, detail="no face on reference photo"
        )

    current_encoding = await video_service.get_face_encoding(frame)
    if current_encoding is None:
        return VerifyFaceResponse(face_count=face_count, is_match=False, reference_ready=True)

    is_match = get_detector().compare_faces(reference_encoding, current_encoding, tolerance=data.tolerance)
    return VerifyFaceResponse(face_count=face_count, is_match=bool(is_match), reference_ready=True)
