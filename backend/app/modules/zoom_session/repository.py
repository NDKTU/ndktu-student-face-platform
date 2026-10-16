"""Zoom seanslari: ro'yxat, boshqaruv, kirish va yuz nazorati.

Kirish qarorini server qiladi (`_admit_student`): faol talaba, uning guruhi
seansga biriktirilgan, hozir seans vaqti va HEMIS surati bor. Yuz nazorati
yoqilgan seansda imzo faqat yaqinda `join` tekshiruvi `ok` bo'lgandan keyin
beriladi — brauzerga ishonilmaydi. Ilgari tekshiruv brauzerda edi va uch
urinishdan keyin (yoki xizmat javob bermasa) talaba baribir kirardi.

Uchrashuvni bekend Zoom API orqali o'zi yaratgan bo'lsa (`zoom_managed`),
talaba yana registrant qilinadi va shaxsiy `tk` token bilan kiradi:
uchrashuv raqami va paroli brauzerga baribir tushadi, lekin ular bilan
Zoom ilovasidan LMS'ni chetlab kirib bo'lmaydi (`zoom_api.py`).
"""

import base64
import binascii
import logging
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from core.config import settings
from fastapi import HTTPException, status
from sqlalchemy import desc, exists, or_, select, union
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.mixins.time_stamp_mixin import utcnow_naive
from app.core.redis_client import redis_client
from app.core.utils.face_absence import FAILED_STATUSES, build_absence_spans, spans_total_seconds
from app.core.utils.face_service import classify, verify_face
from app.core.utils.lesson_access import is_admin
from app.core.utils.zoom_link import ZoomLinkError, parse_zoom_link
from app.core.utils.zoom_signature import HOST_ROLE, PARTICIPANT_ROLE, sign_meeting
from app.modules.auth.model import Student, Teacher, TeacherAssignment, TeacherSubject, User
from app.modules.organization_structure.model import Group
from app.modules.quiz.model import Subject
from app.modules.quiz.quiz_process import errors as quiz_errors
from app.modules.quiz.quiz_process.errors import quiz_error

from .accounts import (
    ENV_ACCOUNT_ID,
    ENV_ACCOUNT_NAME,
    ZoomCredentials,
    all_credentials,
    credentials_by_id,
    env_credentials,
)
from .model import ZoomFaceCheck, ZoomParticipantEvent, ZoomRegistrant, ZoomSession, ZoomSessionGroup
from .schemas import (
    AbsencePeriod,
    FaceCheckReportResponse,
    FaceCheckRequest,
    FaceCheckResponse,
    FaceCheckStudentSummary,
    SessionGroup,
    ZoomAccountOption,
    ZoomCapabilitiesResponse,
    ZoomJoinResponse,
    ZoomOutsider,
    ZoomSeriesFailure,
    ZoomSeriesRequest,
    ZoomSeriesResponse,
    ZoomSeriesUpdateResponse,
    ZoomSessionListResponse,
    ZoomSessionRequest,
    ZoomSessionResponse,
    ZoomStartResponse,
    ZoomSubjectOption,
    ZoomSubjectOptionListResponse,
    ZoomTeacherOption,
    ZoomTeacherOptionListResponse,
)
from .zoom_api import ZoomApiError, api_error, registrant_join_url, registrant_token, zak_token, zoom_api
from app.core.errors import AppError, Invalid, NotFound, error_text

logger = logging.getLogger(__name__)

#: Talaba seansga boshlanishdan shuncha oldin kira oladi.
EARLY_JOIN = timedelta(minutes=10)

#: `join` tekshiruvi `ok` bo'lgach imzo olish uchun vaqt. Qisqa: tasdiqlangan
#: talaba o'rniga boshqasi o'tirib olmasin; SDK qayta ulanishiga esa yetadi.
FACE_OK_TTL_SECONDS = 180

#: Bitta «yo'q» davridan nechta surat saqlanadi (dalil uchun boshidagilari).
MAX_IMAGES_PER_SPAN = 2

#: Talabaning oxirgi tekshiruvi hozirdan (dars tugagach — guruhnikidan)
#: shuncha orqada — erta chiqib ketgan.
LEFT_EARLY_GAP_SECONDS = 5 * 60

#: Webhook hodisasi seansga vaqt bo'yicha bog'lanadi: bir xonada (shaxsiy
#: xona) bir necha seans bo'lishi mumkin. Dars cho'zilsa, chiqish hodisasi
#: tugash vaqtidan keyin keladi — shuning uchun oxirida zaxira kattaroq.
EVENT_MATCH_BEFORE = timedelta(minutes=30)
EVENT_MATCH_AFTER = timedelta(hours=3)

#: Avtomatik nomda shuncha guruh nomi yoziladi, qolgani «+N».
TITLE_GROUPS_SHOWN = 3

#: SDK `customerKey` — webhook'da ishtirokchini foydalanuvchiga bog'laydi.
CUSTOMER_KEY_PREFIX = "lms-"

_PARTICIPANT_EVENTS = {"meeting.participant_joined": "joined", "meeting.participant_left": "left"}

_STATUS_MESSAGE = {
    "ok": "Shaxsingiz tasdiqlandi",
    "no_face": "Kadrda yuz ko'rinmadi — kameraga qarab turing",
    "multiple_faces": "Kadrda bir nechta odam ko'rindi — yolg'iz qoling",
    "different_person": "Yuz HEMIS'dagi surat bilan mos kelmadi — yorug' joyda qayta urinib ko'ring",
    "no_reference": "HEMIS suratingizdan yuz aniqlanmadi — dekanatga murojaat qiling",
    "spoof": "Kamera oldida tirik yuz bo'lishi kerak — rasm yoki telefon ekrani qabul qilinmaydi",
    "no_camera": "Kamera ochilmadi",
    "page_hidden": "Sahifa fonda edi — tekshiruv o'tkazilmadi",
}
_FAILED = set(FAILED_STATUSES)


def _face_ok_key(session_id: int, user_id: int) -> str:
    return f"zoom:face-ok:{session_id}:{user_id}"


# ── Xatolar (`{code, message}` — frontend `errorCodes.ts` bo'yicha tarjima qiladi) ──


def _not_found() -> AppError:
    return quiz_error(status.HTTP_404_NOT_FOUND, "zoom_session_not_found", "Seans topilmadi")


def _not_yours() -> AppError:
    return quiz_error(status.HTTP_403_FORBIDDEN, "zoom_session_not_yours", "Bu seans sizniki emas")


def _not_your_group() -> AppError:
    return quiz_error(
        status.HTTP_403_FORBIDDEN, "zoom_not_your_group", "Bu seans sizning guruhingiz uchun emas"
    )


def _not_open(opens_at: datetime) -> AppError:
    return quiz_error(
        status.HTTP_403_FORBIDDEN,
        "zoom_session_not_open",
        "Seans hali boshlanmagan",
        opens_at=opens_at.replace(tzinfo=timezone.utc).isoformat(),
    )


def _closed() -> AppError:
    return quiz_error(status.HTTP_403_FORBIDDEN, "zoom_session_closed", "Seans vaqti tugagan — kirib bo'lmaydi")


def _face_check_disabled() -> AppError:
    return quiz_error(status.HTTP_409_CONFLICT, "zoom_face_check_disabled", "Bu seansda yuz nazorati o'chirilgan")


def _not_configured() -> AppError:
    return quiz_error(
        status.HTTP_503_SERVICE_UNAVAILABLE, "zoom_not_configured", "Zoom integratsiyasi sozlanmagan"
    )


def _bad_link(cause: Exception) -> AppError:
    return quiz_error(status.HTTP_422_UNPROCESSABLE_CONTENT, "zoom_bad_link", str(cause))


def _link_required() -> AppError:
    return quiz_error(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "zoom_link_required",
        "Zoom havolasini qo'ying — avtomatik yaratish sozlanmagan",
    )


def _teacher_required() -> AppError:
    return quiz_error(status.HTTP_422_UNPROCESSABLE_CONTENT, "zoom_teacher_required", "O'qituvchini tanlang")


def _teacher_not_found() -> AppError:
    return quiz_error(status.HTTP_422_UNPROCESSABLE_CONTENT, "zoom_teacher_not_found", "O'qituvchi topilmadi")


def _teacher_locked() -> AppError:
    return quiz_error(
        status.HTTP_403_FORBIDDEN, "zoom_teacher_locked", "O'qituvchi faqat o'zi uchun seans yarata oladi"
    )


def _subject_required() -> AppError:
    return quiz_error(status.HTTP_422_UNPROCESSABLE_CONTENT, "zoom_subject_required", "Fanni tanlang")


def _subject_not_teachers() -> AppError:
    return quiz_error(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "zoom_subject_not_teachers",
        "Bu fan tanlangan o'qituvchiga biriktirilmagan",
    )


def _readable_name(value: str) -> str:
    """HEMIS/EPOS ismlarni ko'pincha KATTA harf bilan beradi: «G‘ULOMOV BEKZOD» → «G‘ulomov Bekzod».

    `str.title()` yaramaydi: u «G‘Ulomov» qiladi (apostrofdan keyin ham katta harf).
    """
    value = (value or "").strip()
    if not value.isupper():
        return value
    return " ".join(word[:1] + word[1:].lower() for word in value.split())


def teacher_short_name(teacher: Teacher) -> str:
    """«Familiya I.O.» — nomga sig'adigan qisqa shakl."""
    parts = (teacher.first_name, teacher.third_name)
    initials = "".join(f"{part.strip()[0]}." for part in parts if part and part.strip())
    last = _readable_name(teacher.last_name)
    return f"{last} {initials}".strip() if last else _readable_name(teacher.full_name)


def auto_title(subject_name: str, teacher: Teacher | None, group_names: list[str]) -> str:
    """«Fan — Familiya I.O. (101-23, 102-23 +2)»."""
    title = subject_name.strip()
    if teacher is not None:
        title = f"{title} — {teacher_short_name(teacher)}"
    names = sorted(group_names)
    if names:
        shown = ", ".join(names[:TITLE_GROUPS_SHOWN])
        if len(names) > TITLE_GROUPS_SHOWN:
            shown += f" +{len(names) - TITLE_GROUPS_SHOWN}"
        title = f"{title} ({shown})"
    return title[:255]


def _reason(cause: HTTPException | AppError) -> str:
    """Xatoning matni: `quiz_error` — `AppError`, oddiy `HTTPException` — satr."""
    return error_text(cause)


def _account_not_found() -> AppError:
    return quiz_error(status.HTTP_422_UNPROCESSABLE_CONTENT, "zoom_account_not_found", "Zoom akkaunti topilmadi")


def _account_cannot_create() -> AppError:
    return quiz_error(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "zoom_account_cannot_create",
        "Bu akkauntda Zoom API sozlanmagan — havolani qo'ying yoki boshqa akkauntni tanlang",
    )


def _account_busy() -> AppError:
    return quiz_error(
        status.HTTP_409_CONFLICT,
        "zoom_account_busy",
        "Bu akkauntda shu vaqtda boshqa seans bor — bitta litsenziya bir vaqtda bitta uchrashuv",
    )


def _no_free_account() -> AppError:
    return quiz_error(
        status.HTTP_409_CONFLICT,
        "zoom_no_free_account",
        "Bu vaqtda bo'sh Zoom akkaunt yo'q — boshqa vaqtni tanlang",
    )


def _account_required() -> AppError:
    return quiz_error(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "zoom_account_required",
        "Uchrashuv qaysi Zoom akkauntiniki ekanini aniqlab bo'lmadi — akkauntni tanlang",
    )


def _not_managed() -> AppError:
    return quiz_error(
        status.HTTP_409_CONFLICT,
        "zoom_not_managed",
        "Uchrashuv LMS orqali yaratilmagan — uni Zoom ilovasida o'zingiz boshlang",
    )


def _parse_zoom_time(value) -> datetime | None:
    """`2026-10-10T09:00:00Z` → naiv UTC."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


class ZoomSessionRepository:
    # ── Yordamchilar ─────────────────────────────────────────────────────────

    @staticmethod
    def _status(zs: ZoomSession, now: datetime) -> str:
        if now < zs.starts_at - EARLY_JOIN:
            return "upcoming"
        if now <= zs.ends_at:
            return "open"
        return "closed"

    @staticmethod
    async def _student(session: AsyncSession, user_id: int) -> Student | None:
        """Talabaning oxirgi yozuvi: `students.user_id` noyob emas (HEMIS takrorlari)."""
        return (
            await session.execute(
                select(Student).where(Student.user_id == user_id).order_by(Student.id.desc()).limit(1)
            )
        ).scalar_one_or_none()

    @staticmethod
    def _can_manage(zs: ZoomSession, user: User) -> bool:
        """Admin, yaratuvchi va biriktirilgan o'qituvchi: ular darsni olib boradi."""
        return is_admin(user) or user.id in {zs.created_by_user_id, zs.teacher_user_id} - {None}

    @staticmethod
    def _is_host(zs: ZoomSession, user: User) -> bool:
        """Uchrashuvda host — darsning o'qituvchisi (o'qituvchisiz eski seansda — yaratuvchi).

        Admin boshqaradi, lekin host emas: bir Zoom foydalanuvchisi ikki joyda
        host bo'lib o'tirsa, Zoom birini chiqarib yuboradi.
        """
        return user.id == (zs.teacher_user_id or zs.created_by_user_id)

    async def _get(self, session: AsyncSession, session_id: int) -> ZoomSession:
        zs = (
            await session.execute(
                select(ZoomSession)
                .options(
                    selectinload(ZoomSession.group_links).selectinload(ZoomSessionGroup.group),
                    selectinload(ZoomSession.subject),
                    selectinload(ZoomSession.created_by),
                    selectinload(ZoomSession.zoom_account),
                    selectinload(ZoomSession.teacher),
                )
                .where(ZoomSession.id == session_id)
            )
        ).scalar_one_or_none()
        if zs is None:
            raise _not_found()
        return zs

    async def _get_managed(self, session: AsyncSession, session_id: int, user: User) -> ZoomSession:
        zs = await self._get(session, session_id)
        if not self._can_manage(zs, user):
            raise _not_yours()
        return zs

    def _to_response(
        self,
        zs: ZoomSession,
        user: User,
        now: datetime,
        series: dict[int, tuple[int, int]] | None = None,
    ) -> ZoomSessionResponse:
        manage = self._can_manage(zs, user)
        position, total = (series or {}).get(zs.id, (None, None))
        return ZoomSessionResponse(
            id=zs.id,
            title=zs.title,
            starts_at=zs.starts_at,
            ends_at=zs.ends_at,
            opens_at=zs.starts_at - EARLY_JOIN,
            status=self._status(zs, now),  # type: ignore[arg-type]
            subject_id=zs.subject_id,
            subject_name=zs.subject.name if zs.subject else None,
            teacher_user_id=zs.teacher_user_id,
            teacher_name=_readable_name(zs.teacher.full_name) if zs.teacher else None,
            groups=sorted(
                (SessionGroup(id=link.group.id, name=link.group.name) for link in zs.group_links if link.group),
                key=lambda g: g.name,
            ),
            face_check_enabled=zs.face_check_enabled,
            is_active=zs.is_active,
            can_manage=manage,
            link_url=zs.link_url if manage else None,
            created_by_name=zs.created_by.username if zs.created_by else None,
            zoom_managed=zs.zoom_managed,
            zoom_account_id=(zs.zoom_account_id or ENV_ACCOUNT_ID) if manage else None,
            zoom_account_name=(zs.zoom_account.name if zs.zoom_account else ENV_ACCOUNT_NAME) if manage else None,
            series_id=zs.series_id,
            series_position=position,
            series_total=total,
        )

    @staticmethod
    async def _series_positions(session: AsyncSession, rows: list[ZoomSession]) -> dict[int, tuple[int, int]]:
        """seans id → (seriyadagi o'rni, jami) — «3 / 8» uchun, bitta so'rovda."""
        series_ids = {zs.series_id for zs in rows if zs.series_id}
        if not series_ids:
            return {}
        members = (
            await session.execute(
                select(ZoomSession.series_id, ZoomSession.id)
                .where(ZoomSession.series_id.in_(series_ids))
                .order_by(ZoomSession.series_id, ZoomSession.starts_at, ZoomSession.id)
            )
        ).all()
        by_series: dict[str, list[int]] = {}
        for series_id, session_id in members:
            by_series.setdefault(series_id, []).append(session_id)
        return {
            session_id: (index, len(ids))
            for ids in by_series.values()
            for index, session_id in enumerate(ids, start=1)
        }

    # ── Ro'yxat ──────────────────────────────────────────────────────────────

    async def list_sessions(
        self, session: AsyncSession, user: User, scope: str | None = None
    ) -> ZoomSessionListResponse:
        """Admin — hammasi; boshqalar — o'zi yaratgani va o'z guruhining faol seanslari."""
        stmt = select(ZoomSession).options(
            selectinload(ZoomSession.group_links).selectinload(ZoomSessionGroup.group),
            selectinload(ZoomSession.subject),
            selectinload(ZoomSession.created_by),
            selectinload(ZoomSession.zoom_account),
            selectinload(ZoomSession.teacher),
        )
        if not is_admin(user):
            student = await self._student(session, user.id)
            visible = [ZoomSession.created_by_user_id == user.id, ZoomSession.teacher_user_id == user.id]
            if student is not None and student.group_id is not None:
                visible.append(
                    ZoomSession.is_active.is_(True)
                    & exists().where(
                        ZoomSessionGroup.session_id == ZoomSession.id,
                        ZoomSessionGroup.group_id == student.group_id,
                    )
                )
            stmt = stmt.where(or_(*visible))

        now = utcnow_naive()
        if scope == "now":
            stmt = stmt.where(ZoomSession.starts_at - EARLY_JOIN <= now, ZoomSession.ends_at >= now)
        elif scope == "upcoming":
            stmt = stmt.where(ZoomSession.starts_at - EARLY_JOIN > now)
        elif scope == "past":
            stmt = stmt.where(ZoomSession.ends_at < now)
        # O'tganlar — eng yangisi yuqorida, qolganlari — eng yaqini yuqorida.
        order = desc(ZoomSession.starts_at) if scope == "past" else ZoomSession.starts_at
        rows = (await session.execute(stmt.order_by(order, ZoomSession.id).limit(300))).scalars().all()
        series = await self._series_positions(session, list(rows))
        return ZoomSessionListResponse(sessions=[self._to_response(zs, user, now, series) for zs in rows])

    async def get_session(self, session: AsyncSession, session_id: int, user: User) -> ZoomSessionResponse:
        zs = await self._get(session, session_id)
        if not self._can_manage(zs, user):
            student = await self._student(session, user.id)
            group_ids = {link.group_id for link in zs.group_links}
            if not zs.is_active or student is None or student.group_id not in group_ids:
                raise _not_found()
        return self._to_response(zs, user, utcnow_naive(), await self._series_positions(session, [zs]))

    # ── Boshqaruv ────────────────────────────────────────────────────────────

    async def _apply(self, session: AsyncSession, zs: ZoomSession, data: ZoomSessionRequest, user: User) -> None:
        # API yaratgan uchrashuvning havolasi bizniki — tahrirda almashtirilmaydi.
        if not zs.zoom_managed:
            if data.link_url is None:
                raise _link_required()
            try:
                meeting_number, _ = parse_zoom_link(data.link_url)
            except ZoomLinkError as cause:
                raise _bad_link(cause) from cause
            zs.link_url = data.link_url
            zs.zoom_meeting_id = int(meeting_number)
        group_ids = set(data.group_ids)
        group_names = dict(
            (await session.execute(select(Group.id, Group.name).where(Group.id.in_(group_ids)))).all()
        )
        if set(group_names) != group_ids:
            raise Invalid("group_not_found", "Guruh topilmadi")

        teacher = await self._resolve_teacher(session, user, data.teacher_user_id)
        if data.subject_id is None:
            raise _subject_required()
        subject = await session.get(Subject, data.subject_id)
        if subject is None:
            raise Invalid("subject_not_found", "Fan topilmadi")
        if data.subject_id not in await self._teacher_subject_ids(session, teacher.id):
            raise _subject_not_teachers()

        zs.teacher_user_id = teacher.user_id
        zs.title = data.title or auto_title(subject.name, teacher, list(group_names.values()))
        zs.starts_at = data.starts_at
        zs.ends_at = data.ends_at
        zs.subject_id = data.subject_id
        zs.face_check_enabled = data.face_check_enabled
        zs.is_active = data.is_active
        current = {link.group_id: link for link in zs.group_links}
        for group_id, link in current.items():
            if group_id not in group_ids:
                zs.group_links.remove(link)
        for group_id in group_ids - set(current):
            zs.group_links.append(ZoomSessionGroup(group_id=group_id))

    # ── O'qituvchi va fan ────────────────────────────────────────────────────

    @staticmethod
    async def _teacher_by_user(session: AsyncSession, user_id: int) -> Teacher | None:
        return (
            await session.execute(
                select(Teacher).options(selectinload(Teacher.kafedra)).where(Teacher.user_id == user_id)
            )
        ).scalar_one_or_none()

    async def _own_teacher(self, session: AsyncSession, user: User) -> Teacher | None:
        """Admin bo'lmagan o'qituvchi faqat o'zi uchun seans tuzadi."""
        return None if is_admin(user) else await self._teacher_by_user(session, user.id)

    async def _resolve_teacher(self, session: AsyncSession, user: User, teacher_user_id: int | None) -> Teacher:
        own = await self._own_teacher(session, user)
        if own is not None:
            if teacher_user_id not in (None, own.user_id):
                raise _teacher_locked()
            return own
        if teacher_user_id is None:
            raise _teacher_required()
        teacher = await self._teacher_by_user(session, teacher_user_id)
        if teacher is None:
            raise _teacher_not_found()
        return teacher

    @staticmethod
    async def _teacher_subject_ids(session: AsyncSession, teacher_id: int) -> set[int]:
        """O'qituvchining fanlari: `teacher_subject` va EPOS yuklamasi birgalikda.

        Ikkalasi ham kerak: yuklama hammani qamramaydi, `teacher_subject` esa
        yuklamada bor ba'zi fanlarni bilmaydi.
        """
        linked = select(TeacherSubject.subject_id).where(
            TeacherSubject.teacher_id == teacher_id, TeacherSubject.is_active.is_(True)
        )
        assigned = select(TeacherAssignment.subject_id).where(
            TeacherAssignment.teacher_id == teacher_id, TeacherAssignment.is_active.is_(True)
        )
        return set((await session.execute(union(linked, assigned))).scalars().all())

    @staticmethod
    def _teacher_option(teacher: Teacher) -> ZoomTeacherOption:
        return ZoomTeacherOption(
            user_id=teacher.user_id,
            name=_readable_name(teacher.full_name),
            kafedra_name=teacher.kafedra.name if teacher.kafedra else None,
        )

    async def teacher_options(
        self, session: AsyncSession, user: User, search: str | None, limit: int
    ) -> ZoomTeacherOptionListResponse:
        own = await self._own_teacher(session, user)
        if own is not None:
            return ZoomTeacherOptionListResponse(teachers=[self._teacher_option(own)], locked=True)
        stmt = (
            select(Teacher)
            .options(selectinload(Teacher.kafedra))
            .join(User, User.id == Teacher.user_id)
            .where(User.is_active.is_(True), Teacher.is_active.is_(True))
        )
        if search and search.strip():
            stmt = stmt.where(Teacher.full_name.ilike(f"%{search.strip()}%"))
        rows = (await session.execute(stmt.order_by(Teacher.full_name).limit(limit))).scalars().all()
        return ZoomTeacherOptionListResponse(teachers=[self._teacher_option(t) for t in rows])

    async def teacher_subjects(
        self, session: AsyncSession, user: User, teacher_user_id: int
    ) -> ZoomSubjectOptionListResponse:
        teacher = await self._resolve_teacher(session, user, teacher_user_id)
        ids = await self._teacher_subject_ids(session, teacher.id)
        if not ids:
            return ZoomSubjectOptionListResponse(subjects=[])
        rows = (
            await session.execute(select(Subject.id, Subject.name).where(Subject.id.in_(ids)).order_by(Subject.name))
        ).all()
        return ZoomSubjectOptionListResponse(subjects=[ZoomSubjectOption(id=i, name=n) for i, n in rows])

    # ── Akkaunt tanlash ──────────────────────────────────────────────────────

    async def capabilities(self, session: AsyncSession) -> ZoomCapabilitiesResponse:
        accounts = [a for a in await all_credentials(session) if a.sdk_enabled or a.api_enabled]
        options = [
            ZoomAccountOption(id=a.id or ENV_ACCOUNT_ID, name=a.name, auto_create=a.api_enabled and a.sdk_enabled)
            for a in accounts
        ]
        return ZoomCapabilitiesResponse(auto_create=any(o.auto_create for o in options), accounts=options)

    @staticmethod
    async def _session_credentials(session: AsyncSession, zs: ZoomSession) -> ZoomCredentials:
        creds = await credentials_by_id(session, zs.zoom_account_id)
        if creds is None:
            raise _not_configured()
        return creds

    @staticmethod
    async def _account_is_busy(
        session: AsyncSession, creds: ZoomCredentials, starts_at: datetime, ends_at: datetime, exclude_id: int | None
    ) -> bool:
        """Akkaunt hostida shu vaqtga to'g'ri keladigan LMS uchrashuvi bormi.

        Faqat API yaratganlari: ularning hosti aniq — akkaunt hosti. Qo'lda
        qo'yilgan havolaning hosti boshqa foydalanuvchi bo'lishi mumkin.
        """
        account_filter = (
            ZoomSession.zoom_account_id == creds.id if creds.id else ZoomSession.zoom_account_id.is_(None)
        )
        stmt = select(ZoomSession.id).where(
            account_filter,
            ZoomSession.zoom_managed.is_(True),
            ZoomSession.is_active.is_(True),
            ZoomSession.starts_at < ends_at,
            ZoomSession.ends_at > starts_at,
        )
        if exclude_id is not None:
            stmt = stmt.where(ZoomSession.id != exclude_id)
        return (await session.execute(stmt.limit(1))).first() is not None

    async def _choose_for_new_meeting(
        self, session: AsyncSession, data: ZoomSessionRequest
    ) -> ZoomCredentials:
        """Uchrashuvni yaratadigan akkaunt: tanlangani yoki birinchi bo'shi."""
        accounts = await all_credentials(session)
        if data.zoom_account_id is not None:
            chosen = next((a for a in accounts if (a.id or ENV_ACCOUNT_ID) == data.zoom_account_id), None)
            if chosen is None:
                raise _account_not_found()
            if not (chosen.api_enabled and chosen.sdk_enabled):
                raise _account_cannot_create()
            if await self._account_is_busy(session, chosen, data.starts_at, data.ends_at, None):
                raise _account_busy()
            return chosen
        candidates = [a for a in accounts if a.api_enabled and a.sdk_enabled]
        if not candidates:
            raise _link_required()
        for creds in candidates:
            if not await self._account_is_busy(session, creds, data.starts_at, data.ends_at, None):
                return creds
        raise _no_free_account()

    async def _choose_for_link(
        self, session: AsyncSession, requested: int | None, meeting_id: int
    ) -> ZoomCredentials:
        """Qo'lda qo'yilgan havola qaysi akkauntniki.

        Tanlangan bo'lsa — o'sha. Akkaunt bitta bo'lsa — u. Aks holda har
        API'li akkauntdan uchrashuvni so'raymiz: topgani — egasi. SDK imzosi
        boshqa akkauntniki bo'lsa, talaba kira olmaydi (4011), shuning uchun
        taxmin qilmaymiz.
        """
        accounts = await all_credentials(session)
        if requested is not None:
            chosen = next((a for a in accounts if (a.id or ENV_ACCOUNT_ID) == requested), None)
            if chosen is None:
                raise _account_not_found()
            return chosen
        with_sdk = [a for a in accounts if a.sdk_enabled]
        if len(with_sdk) <= 1:
            # Akkaunt umuman yo'q bo'lsa ham seans yaratiladi (oldingidek):
            # kirishda «Zoom sozlanmagan» deyiladi.
            return with_sdk[0] if with_sdk else accounts[0] if accounts else env_credentials()
        for creds in (a for a in with_sdk if a.api_enabled):
            try:
                await zoom_api.get_meeting(creds, meeting_id)
                return creds
            except ZoomApiError:
                continue
        raise _account_required()

    # ── Boshqaruv (davomi) ───────────────────────────────────────────────────

    async def create_session(
        self, session: AsyncSession, data: ZoomSessionRequest, user: User, series_id: str | None = None
    ) -> ZoomSessionResponse:
        """Havola bo'lmasa — uchrashuv Zoom API orqali yaratiladi (ro'yxatdan o'tish bilan)."""
        managed = data.link_url is None
        zs = ZoomSession(created_by_user_id=user.id, group_links=[], zoom_managed=managed, series_id=series_id)
        await self._apply(session, zs, data, user)
        meeting_id: int | None = None
        if managed:
            creds = await self._choose_for_new_meeting(session, data)
            try:
                meeting = await zoom_api.create_meeting(creds, zs.title, data.starts_at, data.ends_at)
            except ZoomApiError as cause:
                raise api_error(cause) from cause
            meeting_id = int(meeting["id"])
            zs.zoom_meeting_id = meeting_id
            zs.link_url = meeting["join_url"]
        else:
            creds = await self._choose_for_link(session, data.zoom_account_id, zs.zoom_meeting_id)
        zs.zoom_account_id = creds.id
        session.add(zs)
        try:
            await session.commit()
        except Exception:
            # Bazaga yozilmadi — Zoom'da egasiz uchrashuv qolmasin.
            if meeting_id is not None:
                await self._delete_meeting_quietly(creds, meeting_id)
            raise
        return await self.get_session(session, zs.id, user)

    async def update_session(
        self, session: AsyncSession, session_id: int, data: ZoomSessionRequest, user: User
    ) -> ZoomSessionResponse:
        zs = await self._get_managed(session, session_id, user)
        before = (zs.title, zs.starts_at, zs.ends_at)
        link_before = zs.link_url
        await self._apply(session, zs, data, user)
        if zs.zoom_managed:
            # API yaratgan uchrashuv o'z akkauntida yashaydi — akkaunt o'zgarmaydi.
            creds = await self._session_credentials(session, zs)
            if zs.is_active and await self._account_is_busy(session, creds, zs.starts_at, zs.ends_at, zs.id):
                await session.rollback()
                raise _account_busy()
            if zs.zoom_meeting_id and before != (zs.title, zs.starts_at, zs.ends_at):
                # Avval Zoom: u rad etsa, bazadagi seans ham o'zgarmaydi.
                try:
                    await zoom_api.update_meeting(creds, zs.zoom_meeting_id, zs.title, zs.starts_at, zs.ends_at)
                except ZoomApiError as cause:
                    await session.rollback()
                    raise api_error(cause) from cause
        elif data.zoom_account_id is not None or zs.link_url != link_before:
            zs.zoom_account_id = (
                await self._choose_for_link(session, data.zoom_account_id, zs.zoom_meeting_id)
            ).id
        await session.commit()
        session.expire(zs)
        return await self.get_session(session, session_id, user)

    async def delete_session(
        self, session: AsyncSession, session_id: int, user: User, scope: str = "one"
    ) -> None:
        if scope == "following":
            anchor = await self._get_managed(session, session_id, user)
            for target_id in await self._following_ids(session, anchor):
                await self._delete_one(session, target_id, user)
            return
        await self._delete_one(session, session_id, user)

    async def _delete_one(self, session: AsyncSession, session_id: int, user: User) -> None:
        zs = await self._get_managed(session, session_id, user)
        if zs.zoom_managed and zs.zoom_meeting_id:
            creds = await credentials_by_id(session, zs.zoom_account_id)
            if creds is not None:
                await self._delete_meeting_quietly(creds, zs.zoom_meeting_id)
        await session.delete(zs)
        await session.commit()

    # ── Seriya ───────────────────────────────────────────────────────────────

    async def create_series(
        self, session: AsyncSession, data: ZoomSeriesRequest, user: User
    ) -> ZoomSeriesResponse:
        """Har hafta / har 2 haftada takrorlanadigan seanslar.

        Har bir sana — alohida seans va alohida Zoom uchrashuvi: «bir litsenziya
        bir vaqtda bitta uchrashuv» va bo'sh akkauntni tanlash o'zgarishsiz
        ishlaydi, bitta sanani ko'chirish esa qolganlariga tegmaydi.

        O'qituvchi, fan va guruhlar avval bir marta tekshiriladi: xato bo'lsa,
        hech narsa yaratilmaydi. Keyin sanalar birma-bir — biror sanada barcha
        akkauntlar band bo'lsa, o'sha sana `failed` ga tushadi, qolganlari yaratiladi.
        """
        # Sinov seansi sessiyaga qo'shilmaydi — bazaga hech narsa yozilmaydi.
        probe = ZoomSession(group_links=[], zoom_managed=data.link_url is None)
        await self._apply(session, probe, data, user)

        series_id = uuid.uuid4().hex
        created: list[ZoomSessionResponse] = []
        failed: list[ZoomSeriesFailure] = []
        # `model_construct`, qayta tekshiruvsiz: vaqt allaqachon UTC ga o'tgan, zonasiz
        # qayta tekshirilsa yana Toshkent deb o'qilib, 5 soatga surilardi.
        base = ZoomSessionRequest.model_construct(**data.model_dump(exclude={"repeat", "repeat_until", "skip_dates"}))
        for starts_at, ends_at in data.occurrences():
            occurrence = base.model_copy(update={"starts_at": starts_at, "ends_at": ends_at})
            try:
                created.append(await self.create_session(session, occurrence, user, series_id=series_id))
            except (HTTPException, AppError) as cause:
                # Rollback kerak emas: `create_session` xatoni seans sessiyaga
                # qo'shilishidan oldin beradi (band akkaunt, Zoom rad etdi).
                failed.append(ZoomSeriesFailure(starts_at=starts_at, reason=_reason(cause)))
        return ZoomSeriesResponse(series_id=series_id, created=created, failed=failed)

    async def _following_ids(self, session: AsyncSession, anchor: ZoomSession) -> list[int]:
        """Shu seans va seriyadagi keyingilari (boshlanishi bo'yicha). Seriyasiz — faqat o'zi."""
        if not anchor.series_id:
            return [anchor.id]
        return list(
            (
                await session.execute(
                    select(ZoomSession.id)
                    .where(ZoomSession.series_id == anchor.series_id, ZoomSession.starts_at >= anchor.starts_at)
                    .order_by(ZoomSession.starts_at, ZoomSession.id)
                )
            )
            .scalars()
            .all()
        )

    async def update_following(
        self, session: AsyncSession, session_id: int, data: ZoomSessionRequest, user: User
    ) -> ZoomSeriesUpdateResponse:
        """Shu seans va seriyadagi keyingilarini o'zgartiradi.

        Vaqt siljish sifatida qo'llanadi: bu seans 08:00 dan 09:30 ga ko'chsa,
        keyingilari ham 1,5 soatga suriladi, kun esa har birida o'ziniki qoladi.
        Har bir seans o'z tranzaksiyasida: biror sanada akkaunt band bo'lsa,
        o'sha sana `failed` ga tushadi, qolganlari o'zgaradi.
        """
        anchor = await self._get_managed(session, session_id, user)
        shift = data.starts_at - anchor.starts_at
        duration = data.ends_at - data.starts_at
        targets = [
            (target_id, starts_at)
            for target_id, starts_at in (
                await session.execute(
                    select(ZoomSession.id, ZoomSession.starts_at).where(
                        ZoomSession.id.in_(await self._following_ids(session, anchor))
                    )
                )
            ).all()
        ]
        updated = 0
        failed: list[ZoomSeriesFailure] = []
        for target_id, starts_at in sorted(targets, key=lambda item: item[1]):
            new_start = starts_at + shift
            target_data = data.model_copy(update={"starts_at": new_start, "ends_at": new_start + duration})
            try:
                await self.update_session(session, target_id, target_data, user)
                updated += 1
            except (HTTPException, AppError) as cause:
                failed.append(ZoomSeriesFailure(starts_at=new_start, reason=_reason(cause)))
                # `update_session` xatoda rollback qiladi — u esa sessiyadagi barcha
                # obyektlarni, jumladan `user` ni eskirtiradi. Qayta o'qimasak,
                # keyingi sanada `user.id` sinxron yuklanib, MissingGreenlet bilan yiqiladi.
                await session.refresh(user)
                await session.refresh(user, attribute_names=["roles"])
        return ZoomSeriesUpdateResponse(
            updated=updated,
            failed=failed,
            session=await self.get_session(session, session_id, user),
        )

    @staticmethod
    async def _delete_meeting_quietly(creds: ZoomCredentials, meeting_id: int) -> None:
        """Zoom ishlamasa ham seans o'chadi: aks holda uni o'chirishning iloji qolmasdi."""
        try:
            await zoom_api.delete_meeting(creds, meeting_id)
        except ZoomApiError as cause:
            logger.warning("Zoom meeting %s was not deleted: %s", meeting_id, cause.message)

    async def start(self, session: AsyncSession, session_id: int, user: User) -> ZoomStartResponse:
        """Host havolasi — har safar yangisi: ichidagi ZAK ~2 soatda eskiradi."""
        zs = await self._get_managed(session, session_id, user)
        if not zs.zoom_managed or not zs.zoom_meeting_id:
            raise _not_managed()
        creds = await self._session_credentials(session, zs)
        if not creds.api_enabled:
            raise _not_configured()
        try:
            meeting = await zoom_api.get_meeting(creds, zs.zoom_meeting_id)
        except ZoomApiError as cause:
            raise api_error(cause) from cause
        return ZoomStartResponse(start_url=meeting["start_url"])

    # ── Kirish ───────────────────────────────────────────────────────────────

    async def _admit_student(self, session: AsyncSession, zs: ZoomSession, user: User) -> Student:
        """Seansga kira oladigan talaba: faol, guruhi biriktirilgan, vaqti, HEMIS surati.

        Etalon faqat HEMIS surati (`students.image_path`): profilga talabaning
        o'zi yuklagan surat bu yerda hisobga olinmaydi — aks holda darsga
        o'rniga o'tiradigan odamning suratini yuklab qo'yish mumkin edi.
        """
        student = await self._student(session, user.id)
        group_ids = {link.group_id for link in zs.group_links}
        if not user.is_active or not zs.is_active or student is None or student.group_id not in group_ids:
            raise _not_your_group()
        now = utcnow_naive()
        if now < zs.starts_at - EARLY_JOIN:
            raise _not_open(zs.starts_at - EARLY_JOIN)
        if now > zs.ends_at:
            raise _closed()
        if not (student.image_path or "").strip():
            raise quiz_errors.student_photo_missing()
        return student

    async def _should_save_image(self, session: AsyncSession, session_id: int, user_id: int) -> bool:
        """Joriy «yo'q» davridan yetarlicha surat olinganmi (`ok` — davr tugadi)."""
        recent = (
            await session.execute(
                select(ZoomFaceCheck.status, ZoomFaceCheck.image_name)
                .where(ZoomFaceCheck.session_id == session_id, ZoomFaceCheck.user_id == user_id)
                .order_by(desc(ZoomFaceCheck.created_at))
                .limit(20)
            )
        ).all()
        saved = 0
        for row_status, image_name in recent:
            if row_status not in _FAILED:
                break
            if image_name:
                saved += 1
        return saved < MAX_IMAGES_PER_SPAN

    @staticmethod
    def _save_image(image_base64: str) -> str | None:
        payload = image_base64.split(",", 1)[-1]
        try:
            raw = base64.b64decode(payload, validate=True)
        except (binascii.Error, ValueError):
            return None
        directory = settings.face_check_upload_dir
        directory.mkdir(parents=True, exist_ok=True)
        name = f"{uuid.uuid4().hex}.jpg"
        (directory / name).write_bytes(raw)
        return name

    async def run_check(
        self, session: AsyncSession, session_id: int, data: FaceCheckRequest, user: User
    ) -> FaceCheckResponse:
        zs = await self._get(session, session_id)
        if not zs.face_check_enabled:
            raise _face_check_disabled()
        student = await self._admit_student(session, zs, user)

        check_status = "no_camera"
        image_name: str | None = None
        if data.page_hidden:
            check_status = "page_hidden"
        elif not data.camera_unavailable and data.image_base64:
            try:
                result = await verify_face(data.image_base64, student.image_path.strip())
            except (httpx.HTTPError, ValueError) as cause:
                # Xizmat javob bermadi — tasdiq yozilmaydi, talaba kirmaydi.
                logger.warning("Face service unavailable for zoom session %s: %s", session_id, cause)
                raise quiz_errors.face_service_unavailable() from cause
            check_status = classify(result)
            if check_status in _FAILED and await self._should_save_image(session, session_id, user.id):
                image_name = self._save_image(data.image_base64)

        record = ZoomFaceCheck(
            session_id=session_id, user_id=user.id, stage=data.stage, status=check_status, image_name=image_name
        )
        session.add(record)
        await session.commit()
        await session.refresh(record)

        admitted = data.stage == "join" and check_status == "ok"
        if admitted:
            await redis_client.set(_face_ok_key(session_id, user.id), "1", ex=FACE_OK_TTL_SECONDS)
        return FaceCheckResponse(
            id=record.id,
            status=check_status,  # type: ignore[arg-type]
            message=_STATUS_MESSAGE.get(check_status, check_status),
            admitted=admitted,
        )

    async def join(self, session: AsyncSession, session_id: int, user: User, *, app: bool = False) -> ZoomJoinResponse:
        """Meeting SDK imzosi — barcha tekshiruvlardan keyin.

        Yaratuvchi va admin tekshiruvsiz kiradi: ular talaba emas, darsni
        olib boradi. Havolaning o'zi (`join_url`) talabaga berilmaydi.
        Imzo uchrashuv egasi akkauntining SDK kaliti bilan — boshqa akkaunt
        kaliti bilan Zoom kiritmaydi (4011).
        """
        zs = await self._get(session, session_id)
        creds = await self._session_credentials(session, zs)
        if not creds.sdk_enabled:
            raise _not_configured()
        group_name: str | None = None
        person = user.username
        if self._can_manage(zs, user):
            # O'qituvchi yuz tekshiruvisiz kiradi: u talaba emas, darsni olib boradi.
            if zs.teacher is not None and zs.teacher_user_id == user.id:
                person = _readable_name(zs.teacher.full_name)
                group_name = "O'qituvchi"
                name = f"{person} · {group_name}"
            else:
                name = user.username
        else:
            student = await self._admit_student(session, zs, user)
            if zs.face_check_enabled and not await redis_client.exists(_face_ok_key(session_id, user.id)):
                raise quiz_errors.face_verification_required()
            group = next((link.group for link in zs.group_links if link.group_id == student.group_id), None)
            group_name = group.name if group else None
            person = student.full_name or user.username
            name = " · ".join(part for part in (student.full_name, group_name) if part)

        token: str | None = None
        zak: str | None = None
        if zs.zoom_managed and self._is_host(zs, user):
            # Darsni olib boruvchi sahifaning o'zida host bo'lib kiradi. Ilgari
            # u registrant-ishtirokchi edi: `mute_upon_entry` mikrofonini
            # o'chirar, uchrashuv esa hostsiz o'tardi (13.10, seans 4).
            zak = await self._host_zak(session, creds, zs)
        elif zs.zoom_managed:
            if not creds.api_enabled:
                raise _not_configured()
            # Registrant ismi Zoom'da «Ism Familiya Guruh» bo'lib ko'rinadi.
            token = await self._registrant_token(session, creds, zs, user, person, group_name or "")

        try:
            meeting_number, passcode = parse_zoom_link(zs.link_url)
        except ZoomLinkError as cause:
            raise _bad_link(cause) from cause

        not_after = int(zs.ends_at.replace(tzinfo=timezone.utc).timestamp())
        return ZoomJoinResponse(
            signature=sign_meeting(
                meeting_number,
                not_after=not_after,
                sdk_key=creds.sdk_key,
                sdk_secret=creds.sdk_secret,
                role=HOST_ROLE if zak else PARTICIPANT_ROLE,
            ),
            sdk_key=creds.sdk_key,
            meeting_number=meeting_number,
            passcode=passcode,
            topic=zs.title,
            user_name=name or user.username,
            registrant_token=token,
            customer_key=f"{CUSTOMER_KEY_PREFIX}{user.id}",
            zak=zak,
            # Faqat telefondan so'ralganda: kompyuterda havola tasodifiy yuz
            # tekshiruvlaridan chetlab o'tish yo'li bo'lib qolardi.
            app_join_url=registrant_join_url(zs.link_url, meeting_number, token) if app and token else None,
        )

    async def _host_zak(self, session: AsyncSession, creds: ZoomCredentials, zs: ZoomSession) -> str:
        """Uchrashuv egasining ZAK tokeni — har safar yangisi (~2 soat amal qiladi)."""
        if not creds.api_enabled or not zs.zoom_meeting_id:
            raise _not_configured()
        try:
            meeting = await zoom_api.get_meeting(creds, zs.zoom_meeting_id)
        except ZoomApiError as cause:
            raise api_error(cause) from cause
        zak = zak_token(meeting.get("start_url") or "")
        if not zak:
            # Ishtirokchi bo'lib kiritmaymiz: aynan shu ovozsiz, hostsiz dars edi.
            raise api_error(ZoomApiError(502, None, "start_url ichida ZAK yo'q"))
        return zak

    async def _registrant_token(
        self,
        session: AsyncSession,
        creds: ZoomCredentials,
        zs: ZoomSession,
        user: User,
        first_name: str,
        last_name: str,
    ) -> str:
        """Shaxsiy kirish tokeni: birinchi kirishda Zoom'dan olinadi, keyin bazadan.

        Registrant faqat shu yerda — guruh, vaqt va yuz tasdig'idan keyin —
        qo'shiladi. Email sun'iy: talabalarda email yo'q, Zoom esa talab qiladi.
        """
        existing = (
            await session.execute(
                select(ZoomRegistrant.join_token).where(
                    ZoomRegistrant.session_id == zs.id, ZoomRegistrant.user_id == user.id
                )
            )
        ).scalar_one_or_none()
        if existing:
            return existing
        try:
            registrant = await zoom_api.add_registrant(
                creds,
                zs.zoom_meeting_id,
                email=f"{CUSTOMER_KEY_PREFIX}{user.id}@{settings.zoom.registrant_email_domain}",
                first_name=first_name,
                last_name=last_name,
            )
        except ZoomApiError as cause:
            raise api_error(cause) from cause
        token = registrant_token(registrant.get("join_url") or "")
        if not token:
            logger.error("Zoom registrant without tk for session %s: %s", zs.id, registrant)
            raise api_error(ZoomApiError(502, None, "registrant tokeni qaytmadi"))
        session.add(
            ZoomRegistrant(
                session_id=zs.id, user_id=user.id, registrant_id=str(registrant["registrant_id"]), join_token=token
            )
        )
        try:
            await session.commit()
        except IntegrityError:
            # Ikki oynadan bir vaqtda kirdi — birinchisi yozib ulgurgan; Zoom
            # bir email uchun bir xil registrantni qaytaradi.
            await session.rollback()
        return token

    # ── Webhook ──────────────────────────────────────────────────────────────

    async def record_participant_event(self, session: AsyncSession, payload: dict) -> bool:
        """`meeting.participant_joined/left` ni yozadi. Seans topilmasa — `False`.

        Ishtirokchi foydalanuvchiga avval registrant orqali bog'lanadi (uni
        server bergan), keyin SDK `customerKey` orqali (qo'lda havola qo'yilgan
        seanslar uchun). Ikkalasi ham yo'q — LMS'ni chetlab kirgan odam.
        """
        kind = _PARTICIPANT_EVENTS.get(payload.get("event") or "")
        obj = (payload.get("payload") or {}).get("object") or {}
        participant = obj.get("participant") or {}
        try:
            meeting_id = int(obj.get("id"))
        except (TypeError, ValueError):
            return False
        if kind is None:
            return False

        occurred_at = _parse_zoom_time(participant.get("join_time" if kind == "joined" else "leave_time"))
        if occurred_at is None and payload.get("event_ts"):
            occurred_at = datetime.fromtimestamp(int(payload["event_ts"]) / 1000, timezone.utc).replace(tzinfo=None)
        if occurred_at is None:
            return False

        zs = (
            await session.execute(
                select(ZoomSession)
                .where(
                    ZoomSession.zoom_meeting_id == meeting_id,
                    ZoomSession.starts_at - EARLY_JOIN - EVENT_MATCH_BEFORE <= occurred_at,
                    ZoomSession.ends_at + EVENT_MATCH_AFTER >= occurred_at,
                )
                .order_by(desc(ZoomSession.starts_at))
                .limit(1)
            )
        ).scalar_one_or_none()
        if zs is None:
            return False

        creds = await credentials_by_id(session, zs.zoom_account_id)
        host = (creds.host_user if creds else "").lower()
        if host and (participant.get("email") or "").lower() == host:
            return False  # o'qituvchi host akkaunti orqali — hisobotga kerak emas

        user_id: int | None = None
        registrant_id = participant.get("registrant_id")
        if registrant_id:
            user_id = (
                await session.execute(
                    select(ZoomRegistrant.user_id).where(
                        ZoomRegistrant.session_id == zs.id, ZoomRegistrant.registrant_id == str(registrant_id)
                    )
                )
            ).scalar_one_or_none()
        customer_key = str(participant.get("customer_key") or "")
        if user_id is None and customer_key.startswith(CUSTOMER_KEY_PREFIX):
            candidate = customer_key[len(CUSTOMER_KEY_PREFIX):]
            if candidate.isdigit() and await session.get(User, int(candidate)) is not None:
                user_id = int(candidate)

        key = str(
            participant.get("participant_uuid")
            or participant.get("user_id")
            or participant.get("id")
            or participant.get("user_name")
            or "unknown"
        )
        await session.execute(
            pg_insert(ZoomParticipantEvent)
            .values(
                session_id=zs.id,
                user_id=user_id,
                event=kind,
                participant_key=key[:128],
                participant_name=(participant.get("user_name") or None) and participant["user_name"][:255],
                occurred_at=occurred_at,
            )
            .on_conflict_do_nothing(constraint="uq_zoom_participant_event")
        )
        await session.commit()
        return True

    # ── Hisobot ──────────────────────────────────────────────────────────────

    async def report(self, session: AsyncSession, session_id: int, user: User) -> FaceCheckReportResponse:
        zs = await self._get_managed(session, session_id, user)
        group_names = {link.group_id: link.group.name for link in zs.group_links if link.group}

        rows = list(
            (
                await session.execute(
                    select(ZoomFaceCheck)
                    .where(ZoomFaceCheck.session_id == session_id)
                    .order_by(ZoomFaceCheck.created_at)
                )
            )
            .scalars()
            .all()
        )
        grouped: dict[int, list[ZoomFaceCheck]] = {}
        for row in rows:
            grouped.setdefault(row.user_id, []).append(row)

        # Guruh tarkibi — har bir foydalanuvchining oxirgi talaba yozuvi.
        roster: dict[int, tuple[str | None, int | None]] = {}
        if group_names:
            for user_id, full_name, group_id in (
                await session.execute(
                    select(Student.user_id, Student.full_name, Student.group_id)
                    .distinct(Student.user_id)
                    .where(Student.user_id.is_not(None))
                    .order_by(Student.user_id, Student.id.desc())
                )
            ).all():
                if group_id in group_names:
                    roster[user_id] = (full_name, group_id)

        presence, outsiders = await self._zoom_presence(session, zs)

        # Tekshiruvi yoki Zoom'da bo'lgani bor, lekin ro'yxatda yo'q (guruhi o'zgargan) — ismi bilan.
        unknown = (set(grouped) | set(presence)) - set(roster)
        if unknown:
            for user_id, username in (
                await session.execute(select(User.id, User.username).where(User.id.in_(unknown)))
            ).all():
                roster[user_id] = (username, None)

        # «Erta chiqdi» nimaga nisbatan: dars ketayotganda — hozirga, aks holda
        # tekshiruvi bo'lgan yagona talaba chiqib ketsa, u o'zi bilan solishtirilib
        # «doim kadrda» ko'rinardi. Dars tugagach — guruhning oxirgi tekshiruviga:
        # o'qituvchi darsni erta yopgan bo'lsa, hammani chiqib ketgan demaylik.
        now = utcnow_naive()
        last_check = max((row.created_at for row in rows), default=None)
        if now < zs.ends_at:
            last_check = now
        students: list[FaceCheckStudentSummary] = []
        for user_id, (full_name, group_id) in roster.items():
            group_name = group_names.get(group_id) if group_id else None
            items = grouped.get(user_id)
            if items:
                summary = self._summary(user_id, full_name, group_name, items, last_check)
            else:
                summary = FaceCheckStudentSummary(
                    user_id=user_id, user_name=full_name, group_name=group_name, joined=user_id in presence
                )
            if user_id in presence:
                summary.zoom_seconds, summary.zoom_first_join = presence[user_id]
            students.append(summary)

        # Kirmaganlar va eng ko'p yo'q bo'lganlar yuqorida — o'qituvchi aynan shularni ko'radi.
        students.sort(key=lambda s: (s.joined, -s.absent_seconds, -s.failed, s.user_name or ""))
        return FaceCheckReportResponse(
            session_id=session_id,
            students=students,
            zoom_tracked=bool(presence or outsiders),
            outsiders=outsiders,
        )

    @staticmethod
    async def _zoom_presence(
        session: AsyncSession, zs: ZoomSession
    ) -> tuple[dict[int, tuple[int, datetime]], list[ZoomOutsider]]:
        """Webhook hodisalaridan: kim qancha uchrashuvda o'tirgan.

        Har bir ishtirokchi kaliti bo'yicha «kirdi → chiqdi» juftlari yig'iladi.
        Chiqishi kelmagan kirish seans oxirigacha (yoki hozirgacha) hisoblanadi.
        """
        events = (
            await session.execute(
                select(ZoomParticipantEvent)
                .where(ZoomParticipantEvent.session_id == zs.id)
                .order_by(ZoomParticipantEvent.occurred_at, ZoomParticipantEvent.id)
            )
        ).scalars().all()
        cutoff = min(utcnow_naive(), zs.ends_at)
        # kalit → (user_id, ism, ochiq kirish, jami soniya, birinchi kirish)
        tracks: dict[str, list] = {}
        for event in events:
            track = tracks.setdefault(event.participant_key, [None, None, None, 0, event.occurred_at])
            track[0] = track[0] or event.user_id
            track[1] = track[1] or event.participant_name
            if event.event == "joined":
                if track[2] is None:
                    track[2] = event.occurred_at
            elif track[2] is not None:
                track[3] += max(0, int((event.occurred_at - track[2]).total_seconds()))
                track[2] = None
        presence: dict[int, tuple[int, datetime]] = {}
        outsiders: dict[str, list] = {}
        for user_id, name, open_since, seconds, first in tracks.values():
            if open_since is not None:
                seconds += max(0, int((max(cutoff, open_since) - open_since).total_seconds()))
            if user_id is not None:
                # Bir talaba qayta ulansa — Zoom yangi `participant_uuid` beradi.
                total, earliest = presence.get(user_id, (0, first))
                presence[user_id] = (total + seconds, min(earliest, first))
            else:
                # Begonalar ism bo'yicha birlashtiriladi: qayta ulanish ularni ko'paytirmasin.
                slot = outsiders.setdefault(name or "?", [name, first, 0])
                slot[1] = min(slot[1], first)
                slot[2] += seconds
        return presence, [
            ZoomOutsider(name=name, first_join=first, seconds=seconds)
            for name, first, seconds in sorted(outsiders.values(), key=lambda item: item[1])
        ]

    @staticmethod
    def _summary(
        user_id: int, user_name: str | None, group_name: str | None, items: list[ZoomFaceCheck], last_check
    ) -> FaceCheckStudentSummary:
        ordered = sorted(items, key=lambda item: item.created_at)
        first, last = ordered[0].created_at, ordered[-1].created_at
        spans = build_absence_spans(ordered)
        return FaceCheckStudentSummary(
            user_id=user_id,
            user_name=user_name,
            group_name=group_name,
            joined=True,
            total=len(ordered),
            passed=sum(1 for item in ordered if item.status == "ok"),
            failed=sum(1 for item in ordered if item.status in _FAILED),
            first_check=first,
            last_check=last,
            tracked_seconds=int((last - first).total_seconds()),
            absent_seconds=spans_total_seconds(spans, last),
            periods=[
                AbsencePeriod(
                    start=span.start,
                    end=span.end,
                    duration_seconds=spans_total_seconds([span], last),
                    checks=span.checks,
                    statuses=span.statuses,
                    image_check_ids=span.image_check_ids,
                )
                for span in spans
            ],
            ended_absent=bool(spans and spans[-1].end is None),
            left_early=bool(
                last_check is not None and (last_check - last).total_seconds() > LEFT_EARLY_GAP_SECONDS
            ),
        )

    async def image_path(self, session: AsyncSession, check_id: int, user: User):
        """Surat faqat yaratuvchi va adminga — `/uploads` ochiq statikasi orqali emas."""
        record = await session.get(ZoomFaceCheck, check_id)
        if record is None or not record.image_name:
            raise NotFound("photo_not_found", "Surat topilmadi")
        await self._get_managed(session, record.session_id, user)
        path = settings.face_check_upload_dir / record.image_name
        if not path.exists():
            raise NotFound("photo_file_missing", "Surat fayli yo'q")
        return path


zoom_session_repository = ZoomSessionRepository()

