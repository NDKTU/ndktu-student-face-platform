import logging
import os
import re
import uuid

from app.core.config import settings
from fastapi import UploadFile
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.mixins.time_stamp_mixin import to_naive_utc as _to_naive_utc
from app.core.mixins.time_stamp_mixin import utcnow_naive as _utcnow
from app.modules.course.access import can_manage
from app.modules.auth.model import Student, Teacher, User
from app.modules.course.model import Course, CourseGroup, Homework, HomeworkSubmission, Lesson
from app.modules.file.repository import get_file_repository
from app.modules.file.storage import sync_usages
from app.modules.notification.model import NotificationType
from app.modules.notification.repository import create_notification
from app.modules.organization_structure.model import Group

from .schemas import (
    HomeworkCreateRequest,
    HomeworkListRequest,
    HomeworkListResponse,
    HomeworkResponse,
    HomeworkStats,
    HomeworkUpdateRequest,
    MySubmissionInfo,
    REOPENED_STATUSES,
    NotSubmittedStudent,
    SubmissionAttempt,
    SubmissionFile,
    SubmissionGradeRequest,
    SubmissionListResponse,
    SubmissionResponse,
    SubmissionReturnRequest,
    SubmissionSubmitRequest,
    SubmissionUserInfo,
)
from app.core.utils.roles import user_is_admin, user_is_student
from app.core.errors import Conflict, Forbidden, Invalid, NotFound, Unprocessable

logger = logging.getLogger(__name__)

# Talaba javobi faqat fayl — PDF yoki rasm. O'qituvchi buni sozlamaydi:
# matnli javob va boshqa turlar (Word, arxiv...) qabul qilinmaydi.
SUBMISSION_FILE_TYPES = ["pdf", "jpg,jpeg,png"]
_ALLOWED_EXTS = {"pdf", "jpg", "jpeg", "png"}
# Bitta vazifaga — bitta fayl, turidan qat'i nazar 2 MB gacha.
_SUBMISSION_MAX = 2 * 1024 * 1024
_SUBMISSION_MAX_FILES = 1

#: Talaba topshirgan, o'qituvchi ko'rishi mumkin bo'lgan holatlar — qayta
#: topshirishga qaytarish shulardan biridan bo'ladi. Baholanmagan ish ham
#: qaytariladi: noto'g'ri fayl, bo'sh sahifa, ko'chirma.
_HANDED_IN = ("submitted", "late", "graded")

_ALREADY_SUBMITTED = "Vazifa allaqachon yuklangan. Uni o'zgartirib yoki o'chirib bo'lmaydi"


# `upload_submission_file` beradigan nom: uuid4 va kengaytma.
_SUBMISSION_NAME_RE = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}")


def _is_device_upload(url: str) -> bool:
    """Havola talabaning o'z qurilmasidan yuklagan fayliga olib boradimi.

    Talaba javobiga faylni faqat `/homework/{id}/upload` orqali biriktiradi.
    U qaytargan havola `homework_submissions/` ga ishora qiladi va fayl
    diskda turadi — kutubxonadagi yoki begona havola bu shartdan o'tmaydi.
    """
    prefix = f"{settings.file_url.http}/homework_submissions/"
    if not url.startswith(prefix):
        return False
    name = url[len(prefix):]
    if not _SUBMISSION_NAME_RE.fullmatch(name):
        return False
    return (settings.homework_submission_upload_dir / name).is_file()


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
    async def _sync_file_usage(self, session: AsyncSession, homework: Homework, user: User) -> None:
        # Kurs kutubxonasi `file_usages` dan yigʻiladi: yozilmasa, vazifa
        # ilovasi u yerda koʻrinmaydi.
        await sync_usages(
            session,
            entity_type="homework",
            entity_id=homework.id,
            urls=[item.get("url") for item in homework.attachments or []],
            owner_user_id=user.id,
        )

    async def _is_admin(self, user: User) -> bool:
        return user_is_admin(user)

    async def _is_student(self, user: User) -> bool:
        return user_is_student(user)

    async def _check_course_owner(self, session: AsyncSession, course_id: int, user: User) -> Course:
        stmt = select(Course).where(Course.id == course_id)
        course = (await session.execute(stmt)).scalar_one_or_none()
        if not course:
            raise NotFound("course_not_found", "Course not found")
        if not await can_manage(session, course, user):
            raise Forbidden(
                "homework_manage_forbidden",
                "Faqat kurs oʻqituvchilari yoki admin uy vazifasini boshqara oladi",
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
            raise Forbidden("course_access_denied", "Not in this Course")

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

        # `returned` baholi va bahosiz bo'ladi — ular alohida sanaladi.
        has_grade = HomeworkSubmission.grade.is_not(None)
        counts_stmt = (
            select(
                HomeworkSubmission.homework_id,
                HomeworkSubmission.status,
                has_grade,
                func.count(HomeworkSubmission.id),
            )
            .where(HomeworkSubmission.homework_id.in_([a.id for a in items]))
            .group_by(HomeworkSubmission.homework_id, HomeworkSubmission.status, has_grade)
        )
        per_homework: dict[int, dict[str, int]] = {}
        for homework_id, sub_status, graded, count in (await session.execute(counts_stmt)).all():
            key = f"{sub_status}_graded" if sub_status == "returned" and graded else sub_status
            bucket = per_homework.setdefault(homework_id, {})
            bucket[key] = bucket.get(key, 0) + count

        stats: dict[int, HomeworkStats] = {}
        for a in items:
            counts = per_homework.get(a.id, {})
            stats[a.id] = HomeworkStats(
                total_students=totals.get(a.course_id, 0),
                # Baholi `returned` — talaba qayta yuborishi mumkin, lekin baho
                # hali turibdi: u topshirilgan ham, baholangan ham. Bahosiz
                # `returned` hech biriga kirmaydi — ish talabada.
                submitted=counts.get("submitted", 0)
                + counts.get("late", 0)
                + counts.get("graded", 0)
                + counts.get("returned_graded", 0),
                graded=counts.get("graded", 0) + counts.get("returned_graded", 0),
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

    async def _bulk_authors(self, session: AsyncSession, items: list[Homework]) -> dict[int, str]:
        """user_id -> ko'rsatiladigan ism.

        Vazifani kim bergani ko'rinishi kerak. `_resolve_names` talaba/o'qituvchi
        jadvallariga qaraydi; ularda yozuvi yo'q (masalan, admin) foydalanuvchi
        uchun `users.username` ga tushiladi, aks holda ustun bo'sh qolardi.
        """
        user_ids = [a.created_by_user_id for a in items if a.created_by_user_id is not None]
        if not user_ids:
            return {}
        resolved = await self._resolve_names(session, list(set(user_ids)))
        names = {uid: full_name for uid, (full_name, _) in resolved.items()}
        missing = [uid for uid in set(user_ids) if uid not in names]
        if missing:
            stmt = select(User.id, User.username).where(User.id.in_(missing))
            for uid, username in (await session.execute(stmt)).all():
                if username:
                    names[uid] = username
        return names

    def _serialize_homework_row(
        self,
        a: Homework,
        stats: HomeworkStats | None,
        course_name: str | None,
        lesson_topic: str | None,
        created_by_name: str | None = None,
    ) -> HomeworkResponse:
        return HomeworkResponse(
            id=a.id,
            course_id=a.course_id,
            course_name=course_name,
            lesson_id=a.lesson_id,
            lesson_topic=lesson_topic,
            created_by_user_id=a.created_by_user_id,
            created_by_name=created_by_name,
            title=a.title,
            description=a.description,
            deadline=a.deadline,
            max_grade=a.max_grade,
            max_attempts=a.max_attempts,
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
        authors = await self._bulk_authors(session, [a])
        return self._serialize_homework_row(
            a,
            stats,
            courses.get(a.course_id),
            lessons.get(a.lesson_id) if a.lesson_id is not None else None,
            authors.get(a.created_by_user_id) if a.created_by_user_id is not None else None,
        )

    # ── Homework CRUD ─────────────────────────────────────────────────────

    async def _default_title(self, session: AsyncSession, lesson_id: int | None) -> str:
        """Sarlavha kiritilmagan vazifa uchun nom.

        Dars mavzusi eng tushunarli nom: talaba ro'yxatda vazifani qaysi
        darsga tegishli ekani bo'yicha topadi. Darsga bog'lanmagan vazifa
        uchun umumiy nom qoladi.
        """
        if lesson_id is not None:
            topic = (
                await session.execute(select(Lesson.topic).where(Lesson.id == lesson_id))
            ).scalar_one_or_none()
            if topic:
                return topic[:255]
        return "Uy vazifasi"

    async def _ensure_lesson_free(
        self, session: AsyncSession, lesson_id: int | None, exclude_homework_id: int | None = None
    ) -> None:
        """Bir darsga — bitta uy vazifasi.

        Bazadagi qisman unikal indeks (`uq_homework_per_lesson`) oxirgi to'siq,
        bu tekshiruv esa foydalanuvchiga IntegrityError o'rniga tushunarli
        xabar qaytaradi.
        """
        if lesson_id is None:
            return
        stmt = select(Homework.id).where(Homework.lesson_id == lesson_id)
        if exclude_homework_id is not None:
            stmt = stmt.where(Homework.id != exclude_homework_id)
        existing = (await session.execute(stmt.limit(1))).scalar_one_or_none()
        if existing is not None:
            raise Conflict(
                "homework_exists_for_lesson",
                "Bu dars uchun uy vazifasi allaqachon mavjud — uni tahrirlang yoki o'chiring",
            )

    async def create_homework(
        self, session: AsyncSession, data: HomeworkCreateRequest, current_user: User
    ) -> HomeworkResponse:
        await self._check_course_owner(session, data.course_id, current_user)
        await self._ensure_lesson_free(session, data.lesson_id)
        await get_file_repository.ensure_teacher_library_urls(
            session, [f.url for f in data.attachments], current_user
        )

        title = (data.title or "").strip() or await self._default_title(session, data.lesson_id)

        a = Homework(
            course_id=data.course_id,
            lesson_id=data.lesson_id,
            created_by_user_id=current_user.id,
            title=title,
            description=data.description,
            deadline=_to_naive_utc(data.deadline),
            max_grade=data.max_grade,
            max_attempts=data.max_attempts,
            allow_file=True,
            allow_text=False,
            allowed_file_types=SUBMISSION_FILE_TYPES,
            attachments=[f.model_dump() for f in data.attachments],
        )
        session.add(a)
        await session.flush()
        await self._sync_file_usage(session, a, current_user)
        await session.commit()
        await session.refresh(a)
        return await self._serialize_homework(session, a)

    async def update_homework(
        self, session: AsyncSession, homework_id: int, data: HomeworkUpdateRequest, current_user: User
    ) -> HomeworkResponse:
        a = (await session.execute(select(Homework).where(Homework.id == homework_id))).scalar_one_or_none()
        if not a:
            raise NotFound("homework_not_found", "Homework not found")
        await self._check_course_owner(session, a.course_id, current_user)
        if data.lesson_id is not None and data.lesson_id != a.lesson_id:
            await self._ensure_lesson_free(session, data.lesson_id, exclude_homework_id=a.id)

        # Bo'sh sarlavha yuborilsa, avvalgisi saqlanadi — vazifa nomsiz qolmasin.
        if data.title is not None and not data.title.strip():
            data = data.model_copy(update={"title": None})

        for field in (
            "lesson_id",
            "title",
            "description",
            "deadline",
            "max_grade",
            "max_attempts",
        ):
            val = getattr(data, field)
            if val is not None:
                if field == "deadline":
                    val = _to_naive_utc(val)
                setattr(a, field, val)
        if data.attachments is not None:
            # Faqat yangi qo'shilganlar tekshiriladi: avvaldan turgan ilova
            # (hamkasbi biriktirgani ham) tahrirlashni to'smasin.
            kept = {item.get("url") for item in a.attachments or []}
            await get_file_repository.ensure_teacher_library_urls(
                session, [f.url for f in data.attachments if f.url not in kept], current_user
            )
            # Ro'yxat butunlay almashtiriladi: forma yakuniy holatni yuboradi.
            a.attachments = [f.model_dump() for f in data.attachments]
            await self._sync_file_usage(session, a, current_user)
        await session.commit()
        await session.refresh(a)
        return await self._serialize_homework(session, a)

    async def delete_homework(self, session: AsyncSession, homework_id: int, current_user: User) -> None:
        a = (await session.execute(select(Homework).where(Homework.id == homework_id))).scalar_one_or_none()
        if not a:
            raise NotFound("homework_not_found", "Homework not found")
        await self._check_course_owner(session, a.course_id, current_user)
        has_submission = (await session.execute(
            select(HomeworkSubmission.id).where(HomeworkSubmission.homework_id == homework_id).limit(1)
        )).scalar_one_or_none()
        if has_submission is not None:
            raise Conflict("homework_has_submissions", "Talabalar javob yuklagan vazifani o'chirib bo'lmaydi")
        await sync_usages(session, entity_type="homework", entity_id=a.id, urls=[])
        await session.delete(a)
        await session.commit()

    async def get_homework(self, session: AsyncSession, homework_id: int, current_user: User) -> HomeworkResponse:
        a = (await session.execute(select(Homework).where(Homework.id == homework_id))).scalar_one_or_none()
        if not a:
            raise NotFound("homework_not_found", "Homework not found")

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
        authors = await self._bulk_authors(session, items)
        mine: dict[int, MySubmissionInfo] = {}
        if items:
            my_stmt = select(HomeworkSubmission).where(
                HomeworkSubmission.user_id == current_user.id,
                HomeworkSubmission.homework_id.in_([a.id for a in items]),
            )
            for sub in (await session.execute(my_stmt)).scalars().all():
                # Kechikish birinchi urinishdan: qayta topshirishni o'qituvchi so'ragan.
                mine[sub.homework_id] = MySubmissionInfo(
                    status=sub.status, grade=sub.grade, submitted_at=sub.first_submitted_at
                )
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
                    authors.get(a.created_by_user_id) if a.created_by_user_id is not None else None,
                ).model_copy(update={"my_submission": mine.get(a.id)})
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
            first_submitted_at=sub.first_submitted_at,
            attempts=[SubmissionAttempt(**item) for item in (sub.attempts or [])],
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
            raise NotFound("homework_not_found", "Homework not found")
        await self._ensure_course_access(session, a.course_id, current_user)

        existing = (await session.execute(
            select(HomeworkSubmission.status).where(
                HomeworkSubmission.homework_id == homework_id,
                HomeworkSubmission.user_id == current_user.id,
            )
        )).scalar_one_or_none()
        # Rad etilgan yoki qayta topshirishga qaytarilgan ishga yangi fayl
        # yuklash mumkin — qolgan hollarda topshirilgan ish o'zgarmaydi.
        if existing is not None and existing not in REOPENED_STATUSES:
            raise Conflict("homework_already_submitted", _ALREADY_SUBMITTED)

        if not a.allow_file:
            raise Invalid("homework_file_not_allowed", "Bu vazifaga fayl biriktirib bo'lmaydi")
        if not file.filename:
            raise Invalid("file_name_empty", "File name is empty")

        ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
        if ext not in _ALLOWED_EXTS:
            raise Invalid("file_type_not_supported", f"Unsupported file type: .{ext}", ext=ext)
        allowed = _expand_allowed_types(a.allowed_file_types)
        if allowed and ext not in allowed:
            raise Invalid("file_type_not_allowed", f"Ruxsat etilmagan fayl turi: .{ext}", ext=ext)

        max_size = _SUBMISSION_MAX
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
                        raise Invalid(
                            "file_too_large",
                            f"Fayl hajmi {max_size // (1024 * 1024)} MB dan oshmasligi kerak",
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
            raise NotFound("homework_not_found", "Homework not found")

        await self._ensure_course_access(session, a.course_id, current_user)

        existing_stmt = select(HomeworkSubmission).where(
            HomeworkSubmission.homework_id == homework_id,
            HomeworkSubmission.user_id == current_user.id,
        )
        sub = (await session.execute(existing_stmt)).scalar_one_or_none()
        if sub is not None and sub.status not in REOPENED_STATUSES:
            raise Conflict("homework_already_submitted", _ALREADY_SUBMITTED)

        text = (data.submitted_text or "").strip() or None
        if text and not a.allow_text:
            raise Invalid("homework_text_not_allowed", "Bu vazifani matn bilan topshirib bo'lmaydi")
        if data.submitted_files and not a.allow_file:
            raise Invalid("homework_file_not_allowed", "Bu vazifaga fayl biriktirib bo'lmaydi")
        if not text and not data.submitted_files:
            raise Invalid("homework_answer_empty", "Javob bo'sh: matn yozing yoki fayl biriktiring")
        if len(data.submitted_files) > _SUBMISSION_MAX_FILES:
            raise Invalid("homework_single_file_only", "Bitta vazifaga faqat bitta fayl biriktirish mumkin")
        allowed = _expand_allowed_types(a.allowed_file_types)
        if allowed:
            for f in data.submitted_files:
                ext = f.name.rsplit(".", 1)[-1].lower() if "." in f.name else ""
                if ext not in allowed:
                    raise Invalid("file_type_not_allowed", f"Ruxsat etilmagan fayl turi: .{ext}", ext=ext)

        # Talaba faylni faqat o'z qurilmasidan yuklaydi — «Fayllar
        # kutubxonasi»dagi yoki begona havola javobga kirmaydi.
        for f in data.submitted_files:
            if not _is_device_upload(f.url):
                raise Invalid("homework_file_not_own", "Faylni o'z qurilmangizdan yuklang")

        now = _utcnow()
        deadline = a.deadline.replace(tzinfo=None) if a.deadline.tzinfo else a.deadline
        files = [f.model_dump() for f in data.submitted_files]

        if sub is None:
            sub = HomeworkSubmission(
                homework_id=homework_id,
                user_id=current_user.id,
                submitted_text=text,
                submitted_files=files,
                submitted_at=now,
                status="late" if now > deadline else "submitted",
            )
            session.add(sub)
        else:
            # Qayta topshirish: eski urinish tarixga ko'chadi, qator o'sha.
            # Kechikish birinchi urinish bo'yicha — qaytarishni o'qituvchi so'ragan,
            # muddatdan keyin yuborilgan ikkinchi javob talabani jazolamaydi.
            first = sub.first_submitted_at
            sub.attempts = [*(sub.attempts or []), _attempt_snapshot(sub)]
            sub.submitted_text = text
            sub.submitted_files = files
            sub.submitted_at = now
            sub.status = "late" if first and first > deadline else "submitted"
            sub.grade = None
            sub.feedback = None
            sub.graded_by_user_id = None
            sub.graded_at = None

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
            raise NotFound("homework_not_found", "Homework not found")
        await self._check_course_owner(session, a.course_id, current_user)

        stmt = (
            select(HomeworkSubmission)
            .options(selectinload(HomeworkSubmission.user))
            .where(HomeworkSubmission.homework_id == homework_id)
            .order_by(desc(HomeworkSubmission.submitted_at))
        )
        items = (await session.execute(stmt)).scalars().all()
        names = await self._resolve_names(session, [sub.user_id for sub in items])

        # `_bulk_stats` dagi «kursdagi talaba» bilan bir xil to'plam: kurs
        # guruhlaridagi talabalar. Hisob bog'lanmagan talaba (user_id yo'q)
        # ish topshira olmaydi — u ro'yxatga kirmaydi.
        submitted_ids = {sub.user_id for sub in items}
        roster_stmt = (
            select(Student.user_id, Student.full_name, Group.name)
            .join(CourseGroup, CourseGroup.group_id == Student.group_id)
            .outerjoin(Group, Group.id == Student.group_id)
            .where(CourseGroup.course_id == a.course_id, Student.user_id.isnot(None))
            .order_by(Group.name, Student.full_name)
        )
        not_submitted = [
            NotSubmittedStudent(user_id=user_id, full_name=full_name, group=group_name)
            for user_id, full_name, group_name in (await session.execute(roster_stmt)).all()
            if user_id not in submitted_ids
        ]
        return SubmissionListResponse(
            submissions=[await self._serialize_submission(sub, names) for sub in items],
            not_submitted=not_submitted,
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
            raise NotFound("homework_not_found", "Homework not found")
        await self._check_course_owner(session, a.course_id, current_user)

        stmt = select(HomeworkSubmission).where(
            HomeworkSubmission.homework_id == homework_id,
            HomeworkSubmission.user_id == user_id,
        )
        sub = (await session.execute(stmt)).scalar_one_or_none()
        if not sub:
            raise NotFound("submission_not_found", "Submission not found")

        if data.grade > a.max_grade:
            raise Invalid("grade_exceeds_max", f"Grade exceeds max_grade ({a.max_grade})", max_grade=a.max_grade)

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

    async def _load_for_review(
        self, session: AsyncSession, homework_id: int, user_id: int, current_user: User
    ) -> tuple[Homework, HomeworkSubmission]:
        a = (await session.execute(select(Homework).where(Homework.id == homework_id))).scalar_one_or_none()
        if not a:
            raise NotFound("homework_not_found", "Homework not found")
        await self._check_course_owner(session, a.course_id, current_user)

        sub = (
            await session.execute(
                select(HomeworkSubmission).where(
                    HomeworkSubmission.homework_id == homework_id,
                    HomeworkSubmission.user_id == user_id,
                )
            )
        ).scalar_one_or_none()
        if not sub:
            raise NotFound("submission_not_found", "Submission not found")
        return a, sub

    async def _reload(self, session: AsyncSession, sub_id: int) -> SubmissionResponse:
        loaded = (
            await session.execute(
                select(HomeworkSubmission)
                .options(selectinload(HomeworkSubmission.user))
                .where(HomeworkSubmission.id == sub_id)
            )
        ).scalar_one()
        names = await self._resolve_names(session, [loaded.user_id])
        return await self._serialize_submission(loaded, names)

    async def _notify(self, session: AsyncSession, a: Homework, user_id: int, title: str, body: str) -> None:
        """Talabaga xabar: ish unga qaytdi va u yana nimadir qilishi kerak.

        Bildirishnoma o'zgarish bilan bitta tranzaksiyada yoziladi
        (`create_notification` kommit qilmaydi).
        """
        await create_notification(
            session,
            user_id=user_id,
            type_=NotificationType.HOMEWORK,
            title=title,
            body=body,
            payload={"homework_id": a.id, "lesson_id": a.lesson_id, "course_id": a.course_id},
        )

    async def return_submission(
        self,
        session: AsyncSession,
        homework_id: int,
        user_id: int,
        data: SubmissionReturnRequest,
        current_user: User,
    ) -> SubmissionResponse:
        """Ishni qayta topshirishga qaytaradi — urinishlar qolgan bo'lsa.

        Baholangan ishda eski baho yangisi qo'yilguncha turadi: talaba qayta
        yubormasa, jurnalda bo'sh joy emas, avvalgi natija qoladi. Baholanmagan
        ish (noto'g'ri fayl, ko'chirma) bahosiz qaytadi, izoh majburiy.
        """
        a, sub = await self._load_for_review(session, homework_id, user_id, current_user)
        if sub.status not in _HANDED_IN:
            raise Conflict("submission_already_returned", "Bu ish allaqachon talabaga qaytarilgan")
        used = len(sub.attempts or []) + 1
        if used >= a.max_attempts:
            raise Conflict(
                "homework_attempts_exhausted",
                f"Urinishlar tugagan: {used} / {a.max_attempts}",
                used=used, max_attempts=a.max_attempts,
            )
        comment = (data.comment or "").strip()
        if sub.grade is None and len(comment) < 3:
            raise Unprocessable("return_reason_required", "Baholanmagan ishni qaytarishda sababni yozing")

        sub.status = "returned"
        if comment:
            sub.feedback = comment
        left = a.max_attempts - used
        if sub.grade is not None:
            title = f"Vazifani qayta topshirishingiz mumkin: {a.title}"
            body = f"Joriy baho: {sub.grade} / {a.max_grade}. " + (f"Izoh: {comment}. " if comment else "")
        else:
            title = f"Vazifa qayta topshirishga qaytarildi: {a.title}"
            body = f"Sabab: {comment}. "
        body += f"Yangi javob yuboring, o'qituvchi uni qayta baholaydi. Qolgan urinishlar: {left}."
        await self._notify(session, a, sub.user_id, title=title, body=body)
        await session.commit()
        return await self._reload(session, sub.id)


def _attempt_snapshot(sub: HomeworkSubmission) -> dict:
    """Joriy urinish — `attempts` ga yoziladigan ko'rinishda (JSONB uchun satrlar)."""
    return {
        "submitted_text": sub.submitted_text,
        "submitted_files": list(sub.submitted_files or []),
        "submitted_at": sub.submitted_at.isoformat() if sub.submitted_at else None,
        "status": sub.status,
        "grade": sub.grade,
        "feedback": sub.feedback,
        "graded_at": sub.graded_at.isoformat() if sub.graded_at else None,
    }


get_homework_repository = HomeworkRepository()
