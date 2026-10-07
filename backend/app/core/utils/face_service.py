"""Yuz xizmatiga (`face-detection`) bitta kadrni solishtirish so'rovi.

Ikki joy ishlatadi: Zoom-darsdagi davriy tekshiruv (`course/face_check`) va
testga kirishdagi tekshiruv (`quiz_process`, `face_entry` rejimi). Ikkalasida
qarorni server qiladi — natija jurnal va testga ruxsatga tushadi, brauzerga
ishonib bo'lmaydi.
"""

import httpx
from core.config import settings


async def verify_face(image_base64: str, reference_url: str) -> dict:
    """Kadrni etalon surat bilan solishtiradi.

    Javob: ``{"face_count", "is_match", "reference_ready", "detail"?}``.
    Xizmat javob bermasa — ``httpx.HTTPError``; chaqiruvchi o'zi hal qiladi.
    """
    url = f"{settings.face_service.url.rstrip('/')}/v1/face/verify"
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            url,
            json={"image_base64": image_base64, "reference_url": reference_url},
            headers={"X-Internal-Token": settings.face_service.internal_token},
        )
        response.raise_for_status()
        return response.json()


def classify(result: dict) -> str:
    """Xizmat javobidan holat: ok, no_face, multiple_faces, different_person, no_reference."""
    face_count = int(result.get("face_count") or 0)
    if not result.get("reference_ready") and face_count == 1:
        return "no_reference"
    if face_count == 0:
        return "no_face"
    if face_count > 1:
        return "multiple_faces"
    return "ok" if result.get("is_match") else "different_person"
