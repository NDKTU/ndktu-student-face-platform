"""Talaba bejigi (7 × 9 sm, tik) uchun maʼlumot va surat.

Bejikning oʻzi brauzerda chiziladi (`frontend/src/lib/studentBadge.ts`):
shrift va logotip oʻsha yerda, oldindan koʻrish ham shu chizmaning oʻzi.
Serverdan ikki narsa olinadi:

- **Maʼlumot** — bejikka chiqadigan maydonlar. Guruh nomi `students`
  jadvalida yoʻq (faqat `group_id`), shuning uchun u shu yerda qoʻshiladi.
- **Surat** — `students.image_path` HEMIS serveriga koʻrsatadi, u esa CORS
  sarlavhasini bermaydi. Brauzer bunday rasmni sahifada koʻrsata oladi, lekin
  canvas'ga chizilgach uni JPG qilib saqlashga ruxsat bermaydi («tainted
  canvas»). Shuning uchun surat backend orqali oʻtadi.

Ikkala endpoint ham faqat adminga ochiq (`AdminRequired`, `auth/router.py`).
"""

import asyncio
import logging

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.modules.auth.model import Student
from app.modules.organization_structure.model import Group

from .schemas import StudentBadgeResponse
from app.core.errors import NotFound, UpstreamError

logger = logging.getLogger(__name__)

#: Etalon surat uchun `face-detection` ham shuncha kutadi
#: (`reference_cache.py`). Frontend bu soʻrovga uzunroq muddat beradi.
PHOTO_TIMEOUT_SECONDS = 10.0

#: HEMIS surati odatda 20-100 KB. Chegara — manzil rasm oʻrniga katta faylga
#: koʻrsatib qolsa, uni xotiraga toʻliq oʻqib yubormaslik uchun.
PHOTO_MAX_BYTES = 10 * 1024 * 1024

#: Umumiy tomdagi fayl: `/uploads/...` (`face-detection` da ham shunday).
LOCAL_PREFIX = "/uploads/"


class _PhotoUnavailable(Exception):
    """Surat manzili bor, lekin faylni olib boʻlmadi yoki u rasm emas."""


async def _load_student(session: AsyncSession, student_id: int) -> Student:
    stmt = (
        select(Student)
        .where(Student.id == student_id)
        .options(selectinload(Student.group).selectinload(Group.faculty))
    )
    student = (await session.execute(stmt)).scalar_one_or_none()
    if not student:
        raise NotFound("student_not_found", "Student not found")
    return student


def _clean(value: str | None) -> str | None:
    return (value or "").strip() or None


async def build_student_badge(session: AsyncSession, student_id: int) -> StudentBadgeResponse:
    student = await _load_student(session, student_id)
    group = student.group

    # Fakultet profildagi bilan bir xil manbadan (`students.faculty`), boʻsh
    # boʻlsa — guruhning fakultetidan: qoʻlda kiritilgan talabada HEMIS
    # maydoni toʻldirilmagan boʻlishi mumkin.
    faculty = _clean(student.faculty)
    if faculty is None and group is not None and group.faculty is not None:
        faculty = _clean(group.faculty.name)

    return StudentBadgeResponse(
        student_id=student.id,
        full_name=_clean(student.full_name) or f"Talaba #{student.id}",
        faculty=faculty,
        group_name=_clean(group.name) if group is not None else None,
        student_id_number=_clean(student.student_id_number),
        has_photo=_clean(student.image_path) is not None,
    )


def _image_media_type(content: bytes) -> str | None:
    """Fayl turi mazmunidan aniqlanadi, sarlavhadan emas.

    Javob admin brauzeriga rasm sifatida qaytadi: manzil boshqa narsaga
    (HTML xato sahifasi, JSON) koʻrsatib qolsa, u rasm deb uzatilmasligi kerak.
    """
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp"
    return None


async def _download(url: str) -> bytes:
    try:
        # Qayta yoʻnaltirishga ergashilmaydi (httpx standarti): manzil bazadan
        # olinadi va u boshqa xostga olib ketmasligi kerak.
        async with httpx.AsyncClient(timeout=PHOTO_TIMEOUT_SECONDS) as client:
            async with client.stream("GET", url) as response:
                response.raise_for_status()
                chunks: list[bytes] = []
                size = 0
                async for chunk in response.aiter_bytes():
                    size += len(chunk)
                    if size > PHOTO_MAX_BYTES:
                        raise _PhotoUnavailable("file is too large")
                    chunks.append(chunk)
                return b"".join(chunks)
    except (httpx.HTTPError, httpx.InvalidURL) as cause:
        raise _PhotoUnavailable(str(cause) or type(cause).__name__) from cause


def _read_local(image_path: str) -> bytes:
    root = settings.absolute_upload_dir.resolve()
    path = (root / image_path[len(LOCAL_PREFIX) :]).resolve()
    # `..` bilan papkadan chiqib ketgan yoʻl oʻqilmaydi.
    if not path.is_relative_to(root) or not path.is_file():
        raise _PhotoUnavailable("file not found")
    if path.stat().st_size > PHOTO_MAX_BYTES:
        raise _PhotoUnavailable("file is too large")
    return path.read_bytes()


async def load_badge_photo(session: AsyncSession, student_id: int) -> tuple[bytes, str]:
    """Talaba surati baytlari va turi (`image/jpeg` va h.k.).

    Surat yoʻq — 404, olib boʻlmadi — 502: frontend ikkala holatda ham
    standart rasm bilan davom etadi, lekin sababini har xil tushuntiradi.
    """
    student = await _load_student(session, student_id)
    image_path = _clean(student.image_path)
    if image_path is None:
        raise NotFound("student_photo_missing", "Talabaning surati yo'q")

    try:
        if image_path.startswith(LOCAL_PREFIX):
            content = await asyncio.to_thread(_read_local, image_path)
        elif image_path.startswith(("http://", "https://")):
            content = await _download(image_path)
        else:
            raise _PhotoUnavailable("unsupported image path")

        media_type = _image_media_type(content)
        if media_type is None:
            raise _PhotoUnavailable("not an image")
    except _PhotoUnavailable as cause:
        logger.warning("Badge photo unavailable (student %s): %s", student_id, cause)
        raise UpstreamError("student_photo_unavailable", "Talaba suratini yuklab bo'lmadi") from cause

    return content, media_type
