import base64
import binascii
import logging
import uuid

import httpx
from core.config import settings
from fastapi import HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utils.face_absence import (
    FAILED_STATUSES,
    build_absence_spans,
    spans_total_seconds,
)
from app.core.utils.lesson_access import is_admin as user_is_admin
from app.core.utils.lesson_access import is_lesson_teacher
from app.core.utils.lesson_scope import covers_group
from app.modules.auth.model import Student, User
from app.modules.course.model import Lesson, LessonFaceCheck

from .schemas import (
    AbsencePeriod,
    FaceCheckReportResponse,
    FaceCheckRequest,
    FaceCheckResponse,
    FaceCheckStudentSummary,
)

logger = logging.getLogger(__name__)

# Talabaga ko'rsatiladigan matnlar: nima bo'lgani va nima qilish kerakligi.
_STATUS_MESSAGE = {
    "ok": "Shaxsingiz tasdiqlandi",
    "no_face": "Kadrda yuz ko'rinmadi — kameraga qarab turing",
    "multiple_faces": "Kadrda bir nechta odam ko'rindi",
    "different_person": "Yuz profil surati bilan mos kelmadi",
    "no_reference": "Profil surati topilmadi — o'qituvchiga murojaat qiling",
    "no_camera": "Kamera ochilmadi",
    "page_hidden": "Sahifa fonda edi — tekshiruv o'tkazilmadi",
}

# Davr hisoblash mantiqi `core/utils/face_absence.py` da: u sof funksiya va
# hisobotda ham, kelajakdagi qayta hisoblashda ham bir xil ishlashi kerak.
_FAILED_STATUSES = set(FAILED_STATUSES)

# Bitta davrdan nechta surat saqlanadi. Tekshiruv endi daqiqada bir marta
# ketadi: 90 daqiqalik darsda 30 talabadan minglab kadr yig'ilardi, holbuki
# o'qituvchiga dalil sifatida boshidagi bir-ikkitasi yetarli.
_MAX_IMAGES_PER_SPAN = 2

# Talabaning oxirgi tekshiruvi guruhnikidan shuncha orqada qolsa, u darsni
# erta tark etgan deb hisoblanadi. Tekshiruv oralig'i ~1 daqiqa, shuning
# uchun bir nechta o'tkazib yuborilgan kadr hali «chiqib ketdi» degani emas.
_LEFT_EARLY_GAP_SECONDS = 5 * 60


class FaceCheckRepository:
    async def _get_lesson(self, session: AsyncSession, lesson_id: int) -> Lesson:
        lesson = (await session.execute(select(Lesson).where(Lesson.id == lesson_id))).scalar_one_or_none()
        if lesson is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dars topilmadi")
        return lesson

    # Ruxsat mantig'i `core/utils/lesson_access.py` da — davomat jurnali ham
    # aynan shu savolga javob beradi, ikki nusxa esa vaqt o'tib bir-biridan
    # ajralib ketardi.
    def _is_admin(self, user: User) -> bool:
        return user_is_admin(user)

    async def _is_lesson_teacher(self, session: AsyncSession, lesson: Lesson, user: User) -> bool:
        return await is_lesson_teacher(session, lesson, user)

    async def _student_of_lesson(self, session: AsyncSession, lesson: Lesson, user: User) -> Student | None:
        student = (
            await session.execute(select(Student).where(Student.user_id == user.id))
        ).scalar_one_or_none()
        if student is None or not await covers_group(session, lesson, student.group_id):
            return None
        return student

    async def _verify_with_service(self, image_base64: str, reference_url: str) -> dict:
        """Kadrni yuz xizmatiga yuboradi. Xizmat javob bermasa — tekshiruvsiz qolamiz."""
        url = f"{settings.face_service.url.rstrip('/')}/v1/face/verify"
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                url,
                json={"image_base64": image_base64, "reference_url": reference_url},
                headers={"X-Internal-Token": settings.face_service.internal_token},
            )
            response.raise_for_status()
            return response.json()

    async def _should_save_image(self, session: AsyncSession, lesson_id: int, user_id: int) -> bool:
        """Joriy «yo'q» davridan yetarlicha surat olinganmi.

        Oxirgi yozuvlarga qaraymiz: yuz topilgan kadrga yetguncha (ya'ni davr
        boshiga) nechta surat saqlanganini sanaymiz. `ok` ko'rinishi bilan
        hisob nolga qaytadi — keyingi yo'qolish yangi davr va u o'z dalilini
        oladi.
        """
        recent = (
            (
                await session.execute(
                    select(LessonFaceCheck.status, LessonFaceCheck.image_name)
                    .where(
                        LessonFaceCheck.lesson_id == lesson_id,
                        LessonFaceCheck.user_id == user_id,
                    )
                    .order_by(desc(LessonFaceCheck.created_at))
                    .limit(20)
                )
            )
            .all()
        )

        saved = 0
        for row_status, image_name in recent:
            if row_status not in _FAILED_STATUSES:
                # Davr shu yerda tugagan (yoki hali boshlanmagan).
                break
            if image_name:
                saved += 1
        return saved < _MAX_IMAGES_PER_SPAN

    def _save_image(self, image_base64: str) -> str | None:
        """Muammoli kadrni diskka yozadi va fayl nomini qaytaradi."""
        payload = image_base64.split(",", 1)[-1]
        try:
            raw = base64.b64decode(payload)
        except (binascii.Error, ValueError):
            return None
        directory = settings.face_check_upload_dir
        directory.mkdir(parents=True, exist_ok=True)
        name = f"{uuid.uuid4().hex}.jpg"
        (directory / name).write_bytes(raw)
        return name

    async def run_check(
        self, session: AsyncSession, lesson_id: int, data: FaceCheckRequest, current_user: User
    ) -> FaceCheckResponse:
        lesson = await self._get_lesson(session, lesson_id)
        if not lesson.face_check_enabled:
            # O'qituvchi bu dars uchun nazoratni yoqmagan — kadr ham qabul
            # qilinmaydi, jurnalga ham yozilmaydi.
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Bu darsda yuz nazorati yoqilmagan",
            )
        student = await self._student_of_lesson(session, lesson, current_user)
        if student is None:
            # Tekshiruv faqat talabalar uchun: o'qituvchi darsni o'zi olib boradi.
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Yuz tekshiruvi faqat guruh talabalari uchun",
            )

        check_status: str = "no_camera"
        image_name: str | None = None

        if data.page_hidden:
            # Sahifa fonda: brauzer taymerlarni sekinlashtiradi va kamera qora
            # kadr berishi mumkin. Bunday kadrga qarab qaror qilish halol emas.
            check_status = "page_hidden"
        elif not data.camera_unavailable and data.image_base64:
            # Etalon: avval foydalanuvchi o'zi yuklagan profil surati, so'ng
            # HEMIS'dagi surat — u eskirgan bo'lishi mumkin.
            reference_url = (current_user.avatar_path or student.image_path or "").strip()
            if not reference_url:
                check_status = "no_reference"
            else:
                try:
                    result = await self._verify_with_service(data.image_base64, reference_url)
                except (httpx.HTTPError, ValueError) as cause:
                    logger.warning("Face service unavailable for lesson %s: %s", lesson_id, cause)
                    raise HTTPException(
                        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                        detail="Yuz tekshiruvi xizmati javob bermadi",
                    ) from cause

                face_count = int(result.get("face_count") or 0)
                if not result.get("reference_ready") and face_count == 1:
                    check_status = "no_reference"
                elif face_count == 0:
                    check_status = "no_face"
                elif face_count > 1:
                    check_status = "multiple_faces"
                elif result.get("is_match"):
                    check_status = "ok"
                else:
                    check_status = "different_person"

            if check_status in _FAILED_STATUSES and await self._should_save_image(
                session, lesson_id, current_user.id
            ):
                image_name = self._save_image(data.image_base64)

        record = LessonFaceCheck(
            lesson_id=lesson_id,
            user_id=current_user.id,
            stage=data.stage,
            status=check_status,
            image_name=image_name,
        )
        session.add(record)
        await session.commit()
        await session.refresh(record)

        return FaceCheckResponse(
            id=record.id,
            status=check_status,  # type: ignore[arg-type]
            message=_STATUS_MESSAGE.get(check_status, check_status),
        )

    async def report(self, session: AsyncSession, lesson_id: int, current_user: User) -> FaceCheckReportResponse:
        lesson = await self._get_lesson(session, lesson_id)
        if not self._is_admin(current_user) and not await self._is_lesson_teacher(session, lesson, current_user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Jurnal faqat dars o'qituvchisiga ochiq",
            )

        rows = list(
            (
                await session.execute(
                    select(LessonFaceCheck)
                    .where(LessonFaceCheck.lesson_id == lesson_id)
                    .order_by(desc(LessonFaceCheck.created_at))
                )
            )
            .scalars()
            .all()
        )

        names: dict[int, str] = {}
        if rows:
            user_ids = {row.user_id for row in rows}
            for user_id, full_name in (
                await session.execute(select(Student.user_id, Student.full_name).where(Student.user_id.in_(user_ids)))
            ).all():
                if full_name:
                    names[user_id] = full_name
            missing = user_ids - set(names)
            if missing:
                for user_id, username in (
                    await session.execute(select(User.id, User.username).where(User.id.in_(missing)))
                ).all():
                    names[user_id] = username

        grouped: dict[int, list[LessonFaceCheck]] = {}
        for row in rows:
            grouped.setdefault(row.user_id, []).append(row)

        # Dars qachon tugaganini hech kim yozib qo'ymaydi, shuning uchun
        # «erta chiqib ketdi» ni guruhdagi eng kech tekshiruvga qarab
        # aniqlaymiz: kimdir hali darsda bo'lsa, tekshiruvi davom etgan.
        lesson_last_check = max((row.created_at for row in rows), default=None)

        students = [
            self._student_summary(user_id, names.get(user_id), items, lesson_last_check)
            for user_id, items in grouped.items()
        ]
        # Eng ko'p yo'q bo'lganlar yuqorida — o'qituvchi aynan shularni ko'radi.
        students.sort(key=lambda item: (-item.absent_seconds, -item.failed, item.user_name or ""))
        return FaceCheckReportResponse(lesson_id=lesson_id, students=students)

    def _student_summary(
        self,
        user_id: int,
        user_name: str | None,
        items: list[LessonFaceCheck],
        lesson_last_check,
    ) -> FaceCheckStudentSummary:
        """Bitta talabaning yozuvlaridan xulosa: kuzatuv oynasi va davrlar."""
        ordered = sorted(items, key=lambda item: item.created_at)
        first_check = ordered[0].created_at
        last_check = ordered[-1].created_at

        spans = build_absence_spans(ordered)
        absent_seconds = spans_total_seconds(spans, last_check)

        # Boshqalar hali tekshirilayotganda bu talabanikilar to'xtagan bo'lsa,
        # u brauzerni yopgan yoki Zoom ilovasiga o'tgan bo'lishi mumkin. Buni
        # «yuz yo'q» bilan aralashtirmaymiz: kamera umuman so'ralmagan.
        left_early = bool(
            lesson_last_check is not None
            and (lesson_last_check - last_check).total_seconds() > _LEFT_EARLY_GAP_SECONDS
        )

        return FaceCheckStudentSummary(
            user_id=user_id,
            user_name=user_name,
            total=len(ordered),
            passed=sum(1 for item in ordered if item.status == "ok"),
            failed=sum(1 for item in ordered if item.status in _FAILED_STATUSES),
            first_check=first_check,
            last_check=last_check,
            tracked_seconds=int((last_check - first_check).total_seconds()),
            absent_seconds=absent_seconds,
            periods=[
                AbsencePeriod(
                    start=span.start,
                    end=span.end,
                    duration_seconds=spans_total_seconds([span], last_check),
                    checks=span.checks,
                    statuses=span.statuses,
                    image_check_ids=span.image_check_ids,
                )
                for span in spans
            ],
            ended_absent=bool(spans and spans[-1].end is None),
            left_early=left_early,
        )

    async def image_path(self, session: AsyncSession, check_id: int, current_user: User):
        """Suratni faqat dars o'qituvchisi va admin ko'radi.

        `/uploads` ochiq statika bo'lgani uchun fayl u yerdan to'g'ridan-to'g'ri
        berilmaydi — havolani bilgan har kim talabaning suratini ochib qo'yardi.
        """
        record = (
            await session.execute(select(LessonFaceCheck).where(LessonFaceCheck.id == check_id))
        ).scalar_one_or_none()
        if record is None or not record.image_name:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Surat topilmadi")

        lesson = await self._get_lesson(session, record.lesson_id)
        if not self._is_admin(current_user) and not await self._is_lesson_teacher(session, lesson, current_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ruxsat yo'q")

        path = settings.face_check_upload_dir / record.image_name
        if not path.exists():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Surat fayli yo'q")
        return path


get_face_check_repository = FaceCheckRepository()
