"""
WebSocket endpoint for real-time frame-by-frame face detection.

ws://host/v1/video/stream

- Client sends : base64-encoded JPEG string (e.g. canvas.toDataURL('image/jpeg', 0.6))
- Server sends : { "has_two_faces": bool, "face_count": int }
"""

import base64
import os
import time
from pathlib import Path

import httpx
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.logging import get_logger
from app.core.security import verify_ws_token
from app.services import video_service
from app.services.video_service import get_detector

router = APIRouter()
logger = get_logger(__name__)


@router.websocket("/stream")
async def realtime_stream(
    websocket: WebSocket,
    token: str | None = None,
    image_url: str | None = None,
) -> None:
    """
    Real-time face detection over WebSocket.

    The browser captures webcam frames and sends them as base64 JPEG strings.
    For every frame the server replies with the detection result.

    Auth: ``?token=<INTERNAL_SERVICE_TOKEN>`` (browsers cannot set custom WS
    headers, so the shared secret is passed as a query parameter).
    If image_url is provided, it's used as the initial reference face.
    """
    if not await verify_ws_token(websocket, token):
        logger.warning("Rejected WebSocket connection from %s: missing/invalid token", websocket.client)
        return

    await websocket.accept()
    logger.info("WebSocket client connected: %s", websocket.client)

    reference_encoding = None
    
    # 0. If image_url is provided, initialize reference_encoding
    if image_url:
        logger.info(f"Initializing reference image from: {image_url}")
        
        # Handle local relative URL directly from mounted volume mapping
        if image_url.startswith("/uploads/"):
            local_path = f"/face{image_url}"
            logger.info(f"Reading local mounted file: {local_path}")
            
            if os.path.exists(local_path):
                ref_frame = await video_service.decode_frame(Path(local_path).read_bytes())
                if ref_frame is not None:
                    reference_encoding = await video_service.get_face_encoding(ref_frame)
                    if reference_encoding is not None:
                        logger.info("Reference face successfully initialized from local file.")
                    else:
                        logger.warning("Could not find a face in the local image.")
                else:
                    logger.error("Failed to decode local reference image.")
            else:
                logger.error(f"Local file not found: {local_path}")
                
        else:
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.get(image_url, timeout=10.0)
                    response.raise_for_status()
                    
                    # Save to temp file and get encoding
                    # Временный файл больше не нужен: кадр разбирается прямо из байтов.
                    ref_frame = await video_service.decode_frame(response.content)
                    if ref_frame is not None:
                        reference_encoding = await video_service.get_face_encoding(ref_frame)
                        if reference_encoding is not None:
                            logger.info("Reference face successfully initialized from URL.")
                        else:
                            logger.warning("Could not find a face in the provided URL image.")
                    else:
                        logger.error("Failed to decode reference image from URL.")
            except Exception as e:
                logger.error(f"Error processing reference image URL: {e}")

    last_recognition_time = 0

    try:
        while True:
            # 1. Receive base64 JPEG frame from browser
            data: str = await websocket.receive_text()

            if "," in data:
                _, data = data.split(",", 1)

            # 2. Decode to OpenCV frame
            try:
                frame = await video_service.decode_frame(base64.b64decode(data))
            except Exception:
                await websocket.send_json({"error": "invalid frame", "has_two_faces": False, "face_count": 0})
                continue

            if frame is None:
                await websocket.send_json({"error": "invalid frame", "has_two_faces": False, "face_count": 0})
                continue

            # 3. Detect and Compare faces
            # Каждый вызов детектора уходит в пул потоков: это счёт на процессоре,
            # и выполненный прямо здесь он останавливал бы обслуживание всех
            # остальных подключённых студентов на время своей работы.
            face_count = await video_service.count_faces(frame)
            is_different_person = False
            current_time = time.time()

            # Recognition logic
            if face_count == 1:
                if reference_encoding is None or (current_time - last_recognition_time >= 5.0):
                    current_encoding = await video_service.get_face_encoding(frame)

                    if reference_encoding is None and current_encoding is not None:
                        # Fallback capture if no URL was provided or URL failed
                        reference_encoding = current_encoding
                        last_recognition_time = current_time
                        logger.info("Reference face captured for session (fallback).")
                    elif reference_encoding is not None and current_encoding is not None:
                        # Periodic identity verification
                        # Сравнение векторов — чистая арифметика без моделей,
                        # выносить её в пул незачем.
                        is_match = get_detector().compare_faces(reference_encoding, current_encoding)
                        last_recognition_time = current_time
                        if not is_match:
                            is_different_person = True
                            logger.warning("Different person detected!")

            # 4. Reply
            await websocket.send_json({
                "has_two_faces": face_count > 1,
                "face_count": face_count,
                "is_different_person": is_different_person,
                "is_reference_captured": reference_encoding is not None
            })

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected.")
    except Exception as exc:
        logger.exception("WebSocket error: %s", exc)

