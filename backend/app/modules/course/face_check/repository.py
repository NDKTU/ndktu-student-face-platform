import base64
import binascii
import logging
import uuid

import httpx
from core.config import settings
from fastapi import HTTPException, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import Student, Teacher, TeacherSubject, User
from app.modules.course.model import Course, Lesson, LessonFaceCheck

from .schemas import (
    FaceCheckItem,
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
}

_FAILED_STATUSES = {"no_face", "multiple_faces", "different_person"}


class FaceCheckRepository:
    async def _get_lesson(self, session: AsyncSession, lesson_id: int) -> Lesson:
        lesson = (await session.execute(select(Lesson).where(Lesson.id == lesson_id))).scalar_one_or_none()
        if lesson is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dars topilmadi")
        return lesson

    def _is_admin(self, user: User) -> bool:
        return any(role.name.lower() == "admin" for role in user.roles)

    async def _is_lesson_teacher(self, session: AsyncSession, lesson: Lesson, user: User) -> bool:
        teacher_user_id = (
            await session.execute(
                select(Teacher.user_id)
                .join(TeacherSubject, TeacherSubject.teacher_id == Teacher.id)
                .where(TeacherSubject.id == lesson.teacher_subject_id)
            )
        ).scalar_one_or_none()
        if teacher_user_id == user.id:
            return True
        course_owner_id = (
            await session.execute(select(Course.teacher_id).where(Course.id == lesson.course_id))
        ).scalar_one_or_none()
        return course_owner_id == user.id

    async def _student_of_lesson(self, session: AsyncSession, lesson: Lesson, user: User) -> Student | None:
        student = (
            await session.execute(select(Student).where(Student.user_id == user.id))
        ).scalar_one_or_none()
        if student is None or student.group_id != lesson.group_id:
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
        student = await self._student_of_lesson(session, lesson, current_user)
        if student is None:
            # Tekshiruv faqat talabalar uchun: o'qituvchi darsni o'zi olib boradi.
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Yuz tekshiruvi faqat guruh talabalari uchun",
            )

        check_status: str = "no_camera"
        image_name: str | None = None

        if not data.camera_unavailable and data.image_base64:
            reference_url = (student.image_path or "").strip()
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

            if check_status in _FAILED_STATUSES:
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

        students = [
            FaceCheckStudentSummary(
                user_id=user_id,
                user_name=names.get(user_id),
                total=len(items),
                passed=sum(1 for item in items if item.status == "ok"),
                failed=sum(1 for item in items if item.status in _FAILED_STATUSES),
                checks=[
                    FaceCheckItem(
                        id=item.id,
                        user_id=item.user_id,
                        user_name=names.get(item.user_id),
                        stage=item.stage,  # type: ignore[arg-type]
                        status=item.status,  # type: ignore[arg-type]
                        has_image=bool(item.image_name),
                        created_at=item.created_at,
                    )
                    for item in items
                ],
            )
            for user_id, items in grouped.items()
        ]
        students.sort(key=lambda item: (-item.failed, item.user_name or ""))
        return FaceCheckReportResponse(lesson_id=lesson_id, students=students)

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
