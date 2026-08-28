import logging
import os
import uuid

from core.config import settings
from fastapi import HTTPException, UploadFile, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.mixins.time_stamp_mixin import to_naive_utc as _to_naive_utc
from app.core.mixins.time_stamp_mixin import utcnow_naive as _utcnow
from app.modules.auth.model import Student, Teacher, User
from app.modules.course.model import Course, CourseGroup, Homework, HomeworkSubmission, Lesson
from app.modules.organization_structure.model import Group

from .schemas import (
    HomeworkCreateRequest,
    HomeworkListRequest,
    HomeworkListResponse,
    HomeworkResponse,
    HomeworkStats,
    HomeworkUpdateRequest,
    SubmissionFile,
    SubmissionGradeRequest,
    SubmissionListResponse,
    SubmissionResponse,
    SubmissionSubmitRequest,
    SubmissionUserInfo,
)

logger = logging.getLogger(__name__)

# Talaba yuklashi mumkin bo'lgan kengaytmalar. O'qituvchi formasidagi
# `FILE_TYPE_OPTIONS` bilan bir xil to'plam (arxiv uchun `rar` ham bor).
_ALLOWED_EXTS = {
    "pdf",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "ppt",
    "pptx",
    "txt",
    "jpg",
    "jpeg",
    "png",
    "webp",
    "zip",
    "rar",
}
_IMAGE_EXTS = {"jpg", "jpeg", "png", "webp"}
_IMAGE_MAX = 5 * 1024 * 1024
_DOC_MAX = 20 * 1024 * 1024


def _expand_allowed_types(allowed_file_types: list | None) -> set[str]:
    """`allowed_file_types` da guruhlar vergul bilan saqlanadi ("doc,docx"),
    chunki forma bir tugma orqali bir nechta kengaytmani tanlaydi."""
    exts: set[str] = set()
    for group in allowed_file_types or []:
        for ext in str(group).split(","):
            ext = ext.strip().lstrip(".").lower()
            if ext:
                exts.add(ext)
    return exts


class HomeworkRepository:
    async def _is_admin(self, user: User) -> bool:
        return any(r.name.lower() == "admin" for r in (user.roles or []))

    async def _is_student(self, user: User) -> bool:
        return any(r.name.lower() == "student" for r in (user.roles or []))

    async def _check_course_owner(self, session: AsyncSession, course_id: int, user: User) -> Course:
        stmt = select(Course).where(Course.id == course_id)
        course = (await session.execute(stmt)).scalar_one_or_none()
        if not course:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
        if not await self._is_admin(user) and course.teacher_id != user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Course owner or admin can manage homeworks",
            )
        return course

    async def _is_restricted_student(self, user: User) -> bool:
        """Bitta hisobda bir nechta rol bo'lishi mumkin: bootstrap admin
        `admin` + `teacher` + `student` rollarini birdan oladi. Talaba
        cheklovi faqat sof talabaga tegishli, aks holda admin o'zi bergan
        vazifani ko'rmay qoladi (`students` jadvalida uning yozuvi yo'q).
        """
        if await self._is_admin(user):
            return False
        return await self._is_student(user)

    async def _visible_course_ids(self, session: AsyncSession, user: User) -> list[int]:
        """Cheklangan foydalanuvchi ko'radigan kurslar: guruhi biriktirilgani
        va o'zi egasi bo'lgani (o'qituvchida `student` roli ham bo'lsa)."""
        enrolled_stmt = (
            select(CourseGroup.course_id)
            .join(Student, Student.group_id == CourseGroup.group_id)
            .where(Student.user_id == user.id)
        )
        owned_stmt = select(Course.id).where(Course.teacher_id == user.id)
        enrolled = (await session.execute(enrolled_stmt)).scalars().all()
        owned = (await session.execute(owned_stmt)).scalars().all()
        return list({*enrolled, *owned})

    async def _ensure_course_access(self, session: AsyncSession, course_id: int, user: User) -> None:
        if not await self._is_restricted_student(user):
            return
        if course_id not in await self._visible_course_ids(session, user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not in this Course")

    async def _bulk_stats(self, session: AsyncSession, items: list[Homework]) -> dict[int, HomeworkStats]:
        """Barcha vazifalar statistikasi ikkita so'rovda.

        Ilgari har bir vazifa uchun ikkita so'rov ketardi — bitta darsda buni
        sezmaslik mumkin edi, lekin umumiy «Uy vazifalari» sahifasida ro'yxat
        uzun bo'ladi va N+1 darhol biliniadi.
        """
        if not items:
            return {}

        course_ids = {a.course_id for a in items}
        totals_stmt = (
            select(CourseGroup.course_id, func.count(Student.id))
            .join(Student, Student.group_id == CourseGroup.group_id)
            .where(CourseGroup.course_id.in_(course_ids))
            .group_by(CourseGroup.course_id)
        )
        totals = {course_id: count for course_id, count in (await session.execute(totals_stmt)).all()}

        counts_stmt = (
            select(HomeworkSubmission.homework_id, HomeworkSubmission.status, func.count(HomeworkSubmission.id))
            .where(HomeworkSubmission.homework_id.in_([a.id for a in items]))
            .group_by(HomeworkSubmission.homework_id, HomeworkSubmission.status)
        )
        per_homework: dict[int, dict[str, int]] = {}
        for homework_id, sub_status, count in (await session.execute(counts_stmt)).all():
            per_homework.setdefault(homework_id, {})[sub_status] = count

        stats: dict[int, HomeworkStats] = {}
        for a in items:
            counts = per_homework.get(a.id, {})
            stats[a.id] = HomeworkStats(
                total_students=totals.get(a.course_id, 0),
                submitted=counts.get("submitted", 0) + counts.get("late", 0) + counts.get("graded", 0),
                graded=counts.get("graded", 0),
                late=counts.get("late", 0),
            )
        return stats

    async def _bulk_labels(
        self, session: AsyncSession, items: list[Homework]
    ) -> tuple[dict[int, str], dict[int, str]]:
        """course_id -> nom, lesson_id -> mavzu.

        Umumiy ro'yxatda faqat sarlavha bilan vazifalarni ajratib bo'lmaydi —
        qaysi kurs va qaysi dars ekani ko'rinishi kerak.
        """
        if not items:
            return {}, {}
        course_stmt = select(Course.id, Course.name).where(Course.id.in_({a.course_id for a in items}))
        courses = {cid: name for cid, name in (await session.execute(course_stmt)).all()}

        lesson_ids = {a.lesson_id for a in items if a.lesson_id is not None}
        lessons: dict[int, str] = {}
        if lesson_ids:
            lesson_stmt = select(Lesson.id, Lesson.topic).where(Lesson.id.in_(lesson_ids))
            lessons = {lid: topic for lid, topic in (await session.execute(lesson_stmt)).all()}
        return courses, lessons

    def _serialize_homework_row(
        self,
        a: Homework,
        stats: HomeworkStats | None,
        course_name: str | None,
        lesson_topic: str | None,
    ) -> HomeworkResponse:
        return HomeworkResponse(
            id=a.id,
            course_id=a.course_id,
            course_name=course_name,
            lesson_id=a.lesson_id,
            lesson_topic=lesson_topic,
            created_by_user_id=a.created_by_user_id,
            title=a.title,
            description=a.description,
            deadline=a.deadline,
            max_grade=a.max_grade,
            allow_file=a.allow_file,
            allow_text=a.allow_text,
            allowed_file_types=list(a.allowed_file_types or []),
            attachments=[SubmissionFile(**f) for f in (a.attachments or [])],
            stats=stats,
            created_at=a.created_at,
            updated_at=a.updated_at,
        )

    async def _serialize_homework(self, session: AsyncSession, a: Homework) -> HomeworkResponse:
        """Bitta vazifa uchun — ro'yxat uchun `_serialize_homework_row` ishlatiladi."""
        stats = (await self._bulk_stats(session, [a])).get(a.id)
        courses, lessons = await self._bulk_labels(session, [a])
        return self._serialize_homework_row(
            a,
            stats,
            courses.get(a.course_id),
            lessons.get(a.lesson_id) if a.lesson_id is not None else None,
        )

    # ── Homework CRUD ─────────────────────────────────────────────────────

    async def create_homework(
        self, session: AsyncSession, data: HomeworkCreateRequest, current_user: User
    ) -> HomeworkResponse:
        await self._check_course_owner(session, data.course_id, current_user)

        a = Homework(
            course_id=data.course_id,
            lesson_id=data.lesson_id,
            created_by_user_id=current_user.id,
            title=data.title,
            description=data.description,
            deadline=_to_naive_utc(data.deadline),
            max_grade=data.max_grade,
            allow_file=data.allow_file,
            allow_text=data.allow_text,
            allowed_file_types=data.allowed_file_types,
            attachments=[f.model_dump() for f in data.attachments],
        )
        session.add(a)
        await session.commit()
        await session.refresh(a)
        return await self._serialize_homework(session, a)

    async def update_homework(
        self, session: AsyncSession, homework_id: int, data: HomeworkUpdateRequest, current_user: User
    ) -> HomeworkResponse:
        a = (await session.execute(select(Homework).where(Homework.id == homework_id))).scalar_one_or_none()
        if not a:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Homework not found")
        await self._check_course_owner(session, a.course_id, current_user)

        for field in (
            "lesson_id",
            "title",
            "description",
            "deadline",
            "max_grade",
            "allow_file",
            "allow_text",
            "allowed_file_types",
        ):
            val = getattr(data, field)
            if val is not None:
                if field == "deadline":
                    val = _to_naive_utc(val)
                setattr(a, field, val)
        if data.attachments is not None:
            # Ro'yxat butunlay almashtiriladi: forma yakuniy holatni yuboradi.
            a.attachments = [f.model_dump() for f in data.attachments]
        await session.commit()
        await session.refresh(a)
        return await self._serialize_homework(session, a)

    async def delete_homework(self, session: AsyncSession, homework_id: int, current_user: User) -> None:
        a = (await session.execute(select(Homework).where(Homework.id == homework_id))).scalar_one_or_none()
        if not a:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Homework not found")
        await self._check_course_owner(session, a.course_id, current_user)
        await session.delete(a)
        await session.commit()

    async def get_homework(self, session: AsyncSession, homework_id: int, current_user: User) -> HomeworkResponse:
        a = (await session.execute(select(Homework).where(Homework.id == homework_id))).scalar_one_or_none()
        if not a:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Homework not found")

        await self._ensure_course_access(session, a.course_id, current_user)

        return await self._serialize_homework(session, a)

    async def list_homeworks(
        self, session: AsyncSession, request: HomeworkListRequest, current_user: User
    ) -> HomeworkListResponse:
        stmt = select(Homework)
        count_stmt = select(func.count()).select_from(Homework)

        # Admindan boshqa hamma o'ziga tegishli kurslar bilan cheklanadi:
        # talaba — guruhi biriktirilganlari, o'qituvchi — o'zi ochganlari.
        # Ilgari cheklov faqat talabaga qo'llanardi va o'qituvchi umumiy
        # ro'yxatda begona kurslarning vazifalarini ko'rardi.
        if not await self._is_admin(current_user):
            course_ids = await self._visible_course_ids(session, current_user)
            if not course_ids:
                return HomeworkListResponse(total=0, page=request.page, limit=request.limit, homeworks=[])
            stmt = stmt.where(Homework.course_id.in_(course_ids))
            count_stmt = count_stmt.where(Homework.course_id.in_(course_ids))

        if request.course_id:
            stmt = stmt.where(Homework.course_id == request.course_id)
            count_stmt = count_stmt.where(Homework.course_id == request.course_id)
        if request.lesson_id:
            stmt = stmt.where(Homework.lesson_id == request.lesson_id)
            count_stmt = count_stmt.where(Homework.lesson_id == request.lesson_id)

        stmt = stmt.order_by(desc(Homework.deadline)).offset(request.offset).limit(request.limit)
        items = list((await session.execute(stmt)).scalars().all())
        total = (await session.execute(count_stmt)).scalar() or 0

        stats = await self._bulk_stats(session, items)
        courses, lessons = await self._bulk_labels(session, items)
        return HomeworkListResponse(
            total=total,
            page=request.page,
            limit=request.limit,
            homeworks=[
                self._serialize_homework_row(
                    a,
                    stats.get(a.id),
                    courses.get(a.course_id),
                    lessons.get(a.lesson_id) if a.lesson_id is not None else None,
                )
                for a in items
            ],
        )

    # ── Submissions ─────────────────────────────────────────────────────────

    async def _resolve_names(self, session: AsyncSession, user_ids: list[int]) -> dict[int, tuple[str, str | None]]:
        """user_id -> (full_name, group_name).

        Bitta so'rovda olinadi: ilgari har bir qator uchun alohida so'rov ketardi
        va faqat `Teacher` qaralardi — natijada o'qituvchi ish topshirgan talaba
        o'rniga HEMIS raqamini ko'rardi.
        """
        if not user_ids:
            return {}
        names: dict[int, tuple[str, str | None]] = {}

        student_stmt = (
            select(Student.user_id, Student.full_name, Group.name)
            .outerjoin(Group, Group.id == Student.group_id)
            .where(Student.user_id.in_(user_ids))
        )
        for user_id, full_name, group_name in (await session.execute(student_stmt)).all():
            if user_id is not None and full_name:
                names[user_id] = (full_name, group_name)

        missing = [uid for uid in user_ids if uid not in names]
        if missing:
            teacher_stmt = select(Teacher.user_id, Teacher.full_name).where(Teacher.user_id.in_(missing))
            for user_id, full_name in (await session.execute(teacher_stmt)).all():
                if user_id is not None and full_name:
                    names[user_id] = (full_name, None)
        return names

    async def _serialize_submission(
        self,
        sub: HomeworkSubmission,
        names: dict[int, tuple[str, str | None]] | None = None,
    ) -> SubmissionResponse:
        user_info: SubmissionUserInfo | None = None
        if sub.user is not None:
            full_name, group_name = (names or {}).get(sub.user.id, (None, None))
            user_info = SubmissionUserInfo(
                id=sub.user.id,
                username=sub.user.username,
                full_name=full_name,
                group=group_name,
            )
        return SubmissionResponse(
            id=sub.id,
            homework_id=sub.homework_id,
            user_id=sub.user_id,
            submitted_text=sub.submitted_text,
            submitted_files=list(sub.submitted_files or []),
            submitted_at=sub.submitted_at,
            status=sub.status,
            grade=sub.grade,
            feedback=sub.feedback,
            graded_at=sub.graded_at,
            user=user_info,
            created_at=sub.created_at,
            updated_at=sub.updated_at,
        )

    async def upload_submission_file(
        self, session: AsyncSession, homework_id: int, file: UploadFile, current_user: User
    ) -> SubmissionFile:
        """Talaba o'z javobini fayl bilan topshiradi.

        Alohida endpoint kerak: `/resource/upload` `create:resource` huquqini
        talab qiladi, talabada esa faqat `read:resource` bor — shuning uchun u
        o'sha yerga fayl yuklay olmasdi.
        """
        a = (await session.execute(select(Homework).where(Homework.id == homework_id))).scalar_one_or_none()
        if not a:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Homework not found")
        await self._ensure_course_access(session, a.course_id, current_user)

        if not a.allow_file:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Bu vazifaga fayl biriktirib bo'lmaydi",
            )
        if not file.filename:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File name is empty")

        ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
        if ext not in _ALLOWED_EXTS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file type: .{ext}",
            )
        allowed = _expand_allowed_types(a.allowed_file_types)
        if allowed and ext not in allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Ruxsat etilmagan fayl turi: .{ext}",
            )

        max_size = _IMAGE_MAX if ext in _IMAGE_EXTS else _DOC_MAX
        upload_dir = settings.homework_submission_upload_dir
        os.makedirs(upload_dir, exist_ok=True)
        stored_name = f"{uuid.uuid4()}.{ext}"
        file_path = upload_dir / stored_name
        size = 0
        try:
            with open(file_path, "wb") as buffer:
                while chunk := await file.read(1024 * 1024):
                    size += len(chunk)
                    if size > max_size:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"File must not exceed {max_size // (1024 * 1024)}MB",
                        )
                    buffer.write(chunk)
        except Exception:
            file_path.unlink(missing_ok=True)
            raise

        return SubmissionFile(
            name=file.filename,
            url=f"{settings.file_url.http}/homework_submissions/{stored_name}",
            size=size,
            type=file.content_type,
        )

    async def submit(
        self, session: AsyncSession, homework_id: int, data: SubmissionSubmitRequest, current_user: User
    ) -> SubmissionResponse:
        a = (await session.execute(select(Homework).where(Homework.id == homework_id))).scalar_one_or_none()
        if not a:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Homework not found")

        await self._ensure_course_access(session, a.course_id, current_user)

        text = (data.submitted_text or "").strip() or None
        if text and not a.allow_text:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Bu vazifani matn bilan topshirib bo'lmaydi",
            )
        if data.submitted_files and not a.allow_file:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Bu vazifaga fayl biriktirib bo'lmaydi",
            )
        if not text and not data.submitted_files:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Javob bo'sh: matn yozing yoki fayl biriktiring",
            )
        allowed = _expand_allowed_types(a.allowed_file_types)
        if allowed:
            for f in data.submitted_files:
                ext = f.name.rsplit(".", 1)[-1].lower() if "." in f.name else ""
                if ext not in allowed:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Ruxsat etilmagan fayl turi: .{ext}",
                    )

        existing_stmt = select(HomeworkSubmission).where(
            HomeworkSubmission.homework_id == homework_id,
            HomeworkSubmission.user_id == current_user.id,
        )
        sub = (await session.execute(existing_stmt)).scalar_one_or_none()

        now = _utcnow()
        deadline = a.deadline.replace(tzinfo=None) if a.deadline.tzinfo else a.deadline
        is_late = now > deadline
        new_status = "late" if is_late else "submitted"

        if sub is None:
            sub = HomeworkSubmission(
                homework_id=homework_id,
                user_id=current_user.id,
                submitted_text=text,
                submitted_files=[f.model_dump() for f in data.submitted_files],
                submitted_at=now,
                status=new_status,
            )
            session.add(sub)
        else:
            if sub.status == "graded":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Submission already graded, cannot resubmit",
                )
            sub.submitted_text = text
            sub.submitted_files = [f.model_dump() for f in data.submitted_files]
            sub.submitted_at = now
            sub.status = new_status

        await session.commit()
        await session.refresh(sub)
        loaded = (
            await session.execute(
                select(HomeworkSubmission)
                .options(selectinload(HomeworkSubmission.user))
                .where(HomeworkSubmission.id == sub.id)
            )
        ).scalar_one()
        names = await self._resolve_names(session, [loaded.user_id])
        return await self._serialize_submission(loaded, names)

    async def get_my_submission(
        self, session: AsyncSession, homework_id: int, current_user: User
    ) -> SubmissionResponse | None:
        stmt = (
            select(HomeworkSubmission)
            .options(selectinload(HomeworkSubmission.user))
            .where(
                HomeworkSubmission.homework_id == homework_id,
                HomeworkSubmission.user_id == current_user.id,
            )
        )
        sub = (await session.execute(stmt)).scalar_one_or_none()
        if not sub:
            return None
        names = await self._resolve_names(session, [sub.user_id])
        return await self._serialize_submission(sub, names)

    async def list_submissions(
        self, session: AsyncSession, homework_id: int, current_user: User
    ) -> SubmissionListResponse:
        a = (await session.execute(select(Homework).where(Homework.id == homework_id))).scalar_one_or_none()
        if not a:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Homework not found")
        await self._check_course_owner(session, a.course_id, current_user)

        stmt = (
            select(HomeworkSubmission)
            .options(selectinload(HomeworkSubmission.user))
            .where(HomeworkSubmission.homework_id == homework_id)
            .order_by(desc(HomeworkSubmission.submitted_at))
        )
        items = (await session.execute(stmt)).scalars().all()
        names = await self._resolve_names(session, [sub.user_id for sub in items])
        return SubmissionListResponse(
            submissions=[await self._serialize_submission(sub, names) for sub in items],
        )

    async def grade_submission(
        self,
        session: AsyncSession,
        homework_id: int,
        user_id: int,
        data: SubmissionGradeRequest,
        current_user: User,
    ) -> SubmissionResponse:
        a = (await session.execute(select(Homework).where(Homework.id == homework_id))).scalar_one_or_none()
        if not a:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Homework not found")
        await self._check_course_owner(session, a.course_id, current_user)

        stmt = select(HomeworkSubmission).where(
            HomeworkSubmission.homework_id == homework_id,
            HomeworkSubmission.user_id == user_id,
        )
        sub = (await session.execute(stmt)).scalar_one_or_none()
        if not sub:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

        if data.grade > a.max_grade:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Grade exceeds max_grade ({a.max_grade})",
            )

        sub.grade = data.grade
        sub.feedback = data.feedback
        sub.status = "graded"
        sub.graded_by_user_id = current_user.id
        sub.graded_at = _utcnow()
        await session.commit()

        loaded = (
            await session.execute(
                select(HomeworkSubmission)
                .options(selectinload(HomeworkSubmission.user))
                .where(HomeworkSubmission.id == sub.id)
            )
        ).scalar_one()
        names = await self._resolve_names(session, [loaded.user_id])
        return await self._serialize_submission(loaded, names)


get_homework_repository = HomeworkRepository()
