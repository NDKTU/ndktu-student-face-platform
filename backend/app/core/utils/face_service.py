"""Yuz xizmatiga (`face-detection`) bitta kadrni solishtirish so'rovi.

Zoom-darsdagi davriy tekshiruv (`course/face_check`) va testga kirishdagi
tekshiruv (`face_entry` rejimi: `quiz_process` va `general_test`). Hammasida
qarorni server qiladi — natija jurnal va testga ruxsatga tushadi, brauzerga
ishonib bo'lmaydi.
"""

import httpx
from core.config import settings

#: Kirishdagi yuz tasdig'i shuncha soniya amal qiladi: talaba «Boshlash» ni
#: shu orada bosishi kerak. Uzoq qilinsa, tasdiqlangan talaba o'rniga
#: boshqasi o'tirib olishi mumkin bo'lardi.
FACE_ENTRY_TTL_SECONDS = 5 * 60

#: `classify` holati → talabaga ko'rsatiladigan matn.
FACE_ENTRY_MESSAGES = {
    "ok": "Shaxsingiz tasdiqlandi",
    "no_face": "Kadrda yuz ko'rinmadi — kameraga to'g'ri qarang va qayta urinib ko'ring",
    "multiple_faces": "Kadrda bir nechta odam bor — yolg'iz qolib, qayta urinib ko'ring",
    "different_person": "Yuz profil surati bilan mos kelmadi — yorug' joyda qayta urinib ko'ring",
    "no_reference": "Profil suratingizdan yuz aniqlanmadi — o'qituvchiga murojaat qiling",
}


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
