"""Zoom seanslari: ro'yxat, boshqaruv, kirish va yuz nazorati.

Kirish qarorini server qiladi (`_admit_student`): faol talaba, uning guruhi
seansga biriktirilgan, hozir seans vaqti va HEMIS surati bor. Yuz nazorati
yoqilgan seansda imzo faqat yaqinda `join` tekshiruvi `ok` bo'lgandan keyin
beriladi — brauzerga ishonilmaydi. Ilgari tekshiruv brauzerda edi va uch
urinishdan keyin (yoki xizmat javob bermasa) talaba baribir kirardi.
"""

import base64
import binascii
import logging
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from core.config import settings
from fastapi import HTTPException, status
from sqlalchemy import desc, exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.mixins.time_stamp_mixin import utcnow_naive
from app.core.redis_client import redis_client
from app.core.utils.face_absence import FAILED_STATUSES, build_absence_spans, spans_total_seconds
from app.core.utils.face_service import classify, verify_face
from app.core.utils.lesson_access import is_admin
from app.core.utils.zoom_link import ZoomLinkError, parse_zoom_link
from app.core.utils.zoom_signature import sign_meeting
from app.modules.auth.model import Student, User
from app.modules.organization_structure.model import Group
from app.modules.quiz.model import Subject
from app.modules.quiz.quiz_process import errors as quiz_errors
from app.modules.quiz.quiz_process.errors import quiz_error

from .model import ZoomFaceCheck, ZoomSession, ZoomSessionGroup
from .schemas import (
    AbsencePeriod,
    FaceCheckReportResponse,
    FaceCheckRequest,
    FaceCheckResponse,
    FaceCheckStudentSummary,
    SessionGroup,
    ZoomJoinResponse,
    ZoomSessionListResponse,
    ZoomSessionRequest,
    ZoomSessionResponse,
)

logger = logging.getLogger(__name__)

#: Talaba seansga boshlanishdan shuncha oldin kira oladi.
EARLY_JOIN = timedelta(minutes=10)

#: `join` tekshiruvi `ok` bo'lgach imzo olish uchun vaqt. Qisqa: tasdiqlangan
#: talaba o'rniga boshqasi o'tirib olmasin; SDK qayta ulanishiga esa yetadi.
FACE_OK_TTL_SECONDS = 180

#: Bitta «yo'q» davridan nechta surat saqlanadi (dalil uchun boshidagilari).
MAX_IMAGES_PER_SPAN = 2

#: Talabaning oxirgi tekshiruvi guruhnikidan shuncha orqada — erta chiqib ketgan.
LEFT_EARLY_GAP_SECONDS = 5 * 60

_STATUS_MESSAGE = {
    "ok": "Shaxsingiz tasdiqlandi",
    "no_face": "Kadrda yuz ko'rinmadi — kameraga qarab turing",
    "multiple_faces": "Kadrda bir nechta odam ko'rindi — yolg'iz qoling",
    "different_person": "Yuz HEMIS'dagi surat bilan mos kelmadi — yorug' joyda qayta urinib ko'ring",
    "no_reference": "HEMIS suratingizdan yuz aniqlanmadi — dekanatga murojaat qiling",
    "no_camera": "Kamera ochilmadi",
    "page_hidden": "Sahifa fonda edi — tekshiruv o'tkazilmadi",
}
_FAILED = set(FAILED_STATUSES)


def _face_ok_key(session_id: int, user_id: int) -> str:
    return f"zoom:face-ok:{session_id}:{user_id}"


# ── Xatolar (`{code, message}` — frontend `errorCodes.ts` bo'yicha tarjima qiladi) ──


def _not_found() -> HTTPException:
    return quiz_error(status.HTTP_404_NOT_FOUND, "zoom_session_not_found", "Seans topilmadi")


def _not_yours() -> HTTPException:
    return quiz_error(status.HTTP_403_FORBIDDEN, "zoom_session_not_yours", "Bu seans sizniki emas")


def _not_your_group() -> HTTPException:
    return quiz_error(
        status.HTTP_403_FORBIDDEN, "zoom_not_your_group", "Bu seans sizning guruhingiz uchun emas"
    )


def _not_open(opens_at: datetime) -> HTTPException:
    return quiz_error(
        status.HTTP_403_FORBIDDEN,
        "zoom_session_not_open",
        "Seans hali boshlanmagan",
        opens_at=opens_at.replace(tzinfo=timezone.utc).isoformat(),
    )


def _closed() -> HTTPException:
    return quiz_error(status.HTTP_403_FORBIDDEN, "zoom_session_closed", "Seans vaqti tugagan — kirib bo'lmaydi")


def _face_check_disabled() -> HTTPException:
    return quiz_error(status.HTTP_409_CONFLICT, "zoom_face_check_disabled", "Bu seansda yuz nazorati o'chirilgan")


def _not_configured() -> HTTPException:
    return quiz_error(
        status.HTTP_503_SERVICE_UNAVAILABLE, "zoom_not_configured", "Zoom integratsiyasi sozlanmagan"
    )


def _bad_link(cause: Exception) -> HTTPException:
    return quiz_error(status.HTTP_422_UNPROCESSABLE_CONTENT, "zoom_bad_link", str(cause))


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
        return is_admin(user) or (zs.created_by_user_id is not None and zs.created_by_user_id == user.id)

    async def _get(self, session: AsyncSession, session_id: int) -> ZoomSession:
        zs = (
            await session.execute(
                select(ZoomSession)
                .options(
                    selectinload(ZoomSession.group_links).selectinload(ZoomSessionGroup.group),
                    selectinload(ZoomSession.subject),
                    selectinload(ZoomSession.created_by),
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

    def _to_response(self, zs: ZoomSession, user: User, now: datetime) -> ZoomSessionResponse:
        manage = self._can_manage(zs, user)
        return ZoomSessionResponse(
            id=zs.id,
            title=zs.title,
            starts_at=zs.starts_at,
            ends_at=zs.ends_at,
            opens_at=zs.starts_at - EARLY_JOIN,
            status=self._status(zs, now),  # type: ignore[arg-type]
            subject_id=zs.subject_id,
            subject_name=zs.subject.name if zs.subject else None,
            groups=sorted(
                (SessionGroup(id=link.group.id, name=link.group.name) for link in zs.group_links if link.group),
                key=lambda g: g.name,
            ),
            face_check_enabled=zs.face_check_enabled,
            is_active=zs.is_active,
            can_manage=manage,
            link_url=zs.link_url if manage else None,
            created_by_name=zs.created_by.username if zs.created_by else None,
        )

    # ── Ro'yxat ──────────────────────────────────────────────────────────────

    async def list_sessions(
        self, session: AsyncSession, user: User, scope: str | None = None
    ) -> ZoomSessionListResponse:
        """Admin — hammasi; boshqalar — o'zi yaratgani va o'z guruhining faol seanslari."""
        stmt = select(ZoomSession).options(
            selectinload(ZoomSession.group_links).selectinload(ZoomSessionGroup.group),
            selectinload(ZoomSession.subject),
            selectinload(ZoomSession.created_by),
        )
        if not is_admin(user):
            student = await self._student(session, user.id)
            visible = [ZoomSession.created_by_user_id == user.id]
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
        return ZoomSessionListResponse(sessions=[self._to_response(zs, user, now) for zs in rows])

    async def get_session(self, session: AsyncSession, session_id: int, user: User) -> ZoomSessionResponse:
        zs = await self._get(session, session_id)
        if not self._can_manage(zs, user):
            student = await self._student(session, user.id)
            group_ids = {link.group_id for link in zs.group_links}
            if not zs.is_active or student is None or student.group_id not in group_ids:
                raise _not_found()
        return self._to_response(zs, user, utcnow_naive())

    # ── Boshqaruv ────────────────────────────────────────────────────────────

    async def _apply(self, session: AsyncSession, zs: ZoomSession, data: ZoomSessionRequest) -> None:
        try:
            parse_zoom_link(data.link_url)
        except ZoomLinkError as cause:
            raise _bad_link(cause) from cause
        group_ids = set(data.group_ids)
        found = set((await session.execute(select(Group.id).where(Group.id.in_(group_ids)))).scalars().all())
        if found != group_ids:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Guruh topilmadi")
        if data.subject_id is not None and await session.get(Subject, data.subject_id) is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Fan topilmadi")

        zs.title = data.title
        zs.link_url = data.link_url
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

    async def create_session(self, session: AsyncSession, data: ZoomSessionRequest, user: User) -> ZoomSessionResponse:
        zs = ZoomSession(created_by_user_id=user.id, group_links=[])
        await self._apply(session, zs, data)
        session.add(zs)
        await session.commit()
        return await self.get_session(session, zs.id, user)

    async def update_session(
        self, session: AsyncSession, session_id: int, data: ZoomSessionRequest, user: User
    ) -> ZoomSessionResponse:
        zs = await self._get_managed(session, session_id, user)
        await self._apply(session, zs, data)
        await session.commit()
        session.expire(zs)
        return await self.get_session(session, session_id, user)

    async def delete_session(self, session: AsyncSession, session_id: int, user: User) -> None:
        zs = await self._get_managed(session, session_id, user)
        await session.delete(zs)
        await session.commit()

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

    async def join(self, session: AsyncSession, session_id: int, user: User) -> ZoomJoinResponse:
        """Meeting SDK imzosi — barcha tekshiruvlardan keyin.

        Yaratuvchi va admin tekshiruvsiz kiradi: ular talaba emas, darsni
        olib boradi. Havolaning o'zi (`join_url`) talabaga berilmaydi.
        """
        if not settings.zoom.enabled:
            raise _not_configured()
        zs = await self._get(session, session_id)
        if self._can_manage(zs, user):
            name = user.username
        else:
            student = await self._admit_student(session, zs, user)
            if zs.face_check_enabled and not await redis_client.exists(_face_ok_key(session_id, user.id)):
                raise quiz_errors.face_verification_required()
            group = next((link.group for link in zs.group_links if link.group_id == student.group_id), None)
            name = " · ".join(part for part in (student.full_name, group.name if group else None) if part)

        try:
            meeting_number, passcode = parse_zoom_link(zs.link_url)
        except ZoomLinkError as cause:
            raise _bad_link(cause) from cause

        not_after = int(zs.ends_at.replace(tzinfo=timezone.utc).timestamp())
        return ZoomJoinResponse(
            signature=sign_meeting(meeting_number, not_after=not_after),
            sdk_key=settings.zoom.client_id,
            meeting_number=meeting_number,
            passcode=passcode,
            topic=zs.title,
            user_name=name or user.username,
        )

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

        # Tekshiruvi bor, lekin ro'yxatda yo'q (guruhi o'zgargan) — ismi bilan.
        unknown = set(grouped) - set(roster)
        if unknown:
            for user_id, username in (
                await session.execute(select(User.id, User.username).where(User.id.in_(unknown)))
            ).all():
                roster[user_id] = (username, None)

        last_check = max((row.created_at for row in rows), default=None)
        students: list[FaceCheckStudentSummary] = []
        for user_id, (full_name, group_id) in roster.items():
            group_name = group_names.get(group_id) if group_id else None
            items = grouped.get(user_id)
            if not items:
                students.append(
                    FaceCheckStudentSummary(user_id=user_id, user_name=full_name, group_name=group_name, joined=False)
                )
                continue
            students.append(self._summary(user_id, full_name, group_name, items, last_check))

        # Kirmaganlar va eng ko'p yo'q bo'lganlar yuqorida — o'qituvchi aynan shularni ko'radi.
        students.sort(key=lambda s: (s.joined, -s.absent_seconds, -s.failed, s.user_name or ""))
        return FaceCheckReportResponse(session_id=session_id, students=students)

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
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Surat topilmadi")
        await self._get_managed(session, record.session_id, user)
        path = settings.face_check_upload_dir / record.image_name
        if not path.exists():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Surat fayli yo'q")
        return path


zoom_session_repository = ZoomSessionRepository()

