"""Kirish: talabani qabul qilish, yuz tekshiruvi, SDK imzosi, host ZAK va registrant tokeni."""

import base64
import binascii
import logging
import uuid
from datetime import timezone

import httpx
from app.core.config import settings
from sqlalchemy import desc, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.mixins.time_stamp_mixin import utcnow_naive
from app.core.redis_client import redis_client
from app.core.utils.face_service import classify, verify_face
from app.core.utils.zoom_link import ZoomLinkError, parse_zoom_link
from app.core.utils.zoom_signature import HOST_ROLE, PARTICIPANT_ROLE, sign_meeting
from app.modules.auth.model import Student, User
from app.modules.quiz.quiz_process import errors as quiz_errors

from .accounts import (
    ZoomCredentials,
)
from .model import ZoomFaceCheck, ZoomRegistrant, ZoomSession
from .schemas import (
    FaceCheckRequest,
    FaceCheckResponse,
    ZoomJoinResponse,
    ZoomStartResponse,
)
from .zoom_api import ZoomApiError, api_error, registrant_join_url, registrant_token, zak_token, zoom_api
from app.core.errors import NotFound
from .common import EARLY_JOIN, FACE_OK_TTL_SECONDS, MAX_IMAGES_PER_SPAN, CUSTOMER_KEY_PREFIX, _STATUS_MESSAGE, _FAILED, _face_ok_key
from .errors import (
    _bad_link,
    _closed,
    _face_check_disabled,
    _not_configured,
    _not_managed,
    _not_open,
    _not_your_group,
    _random_checks_disabled,
)
from .naming import _readable_name

logger = logging.getLogger(__name__)



class ZoomJoinMixin:
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
        if data.stage == "random" and not zs.random_face_checks:
            # Faqat kirishda tekshiriladigan seans: «yo'q» davrlari va erta
            # chiqish hisobotda hisoblanmaydi, ortiqcha yozuv uni chalkashtirardi.
            raise _random_checks_disabled()
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
