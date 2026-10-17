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

import logging
import uuid
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import desc, exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.mixins.time_stamp_mixin import utcnow_naive
from app.modules.course.lesson_access import is_admin
from app.core.utils.zoom_link import ZoomLinkError, parse_zoom_link
from app.modules.auth.model import Student, User
from app.modules.organization_structure.model import Group
from app.modules.quiz.model import Subject

from .accounts import (
    ENV_ACCOUNT_ID,
    ENV_ACCOUNT_NAME,
    ZoomCredentials,
    credentials_by_id,
)
from .model import ZoomSession, ZoomSessionGroup
from .schemas import (
    SessionGroup,
    ZoomSeriesFailure,
    ZoomSeriesRequest,
    ZoomSeriesResponse,
    ZoomSeriesUpdateResponse,
    ZoomSessionListResponse,
    ZoomSessionRequest,
    ZoomSessionResponse,
)
from .zoom_api import ZoomApiError, api_error, zoom_api
from app.core.errors import AppError, Invalid
from .common import EARLY_JOIN
from .errors import _not_found, _not_yours, _bad_link, _link_required, _subject_required, _subject_not_teachers, _reason, _account_busy
from .naming import _readable_name, auto_title
from .teachers import ZoomTeachersMixin
from .account_choice import ZoomAccountChoiceMixin
from .join import ZoomJoinMixin
from .report import ZoomReportMixin

logger = logging.getLogger(__name__)


class ZoomSessionRepository(ZoomTeachersMixin, ZoomAccountChoiceMixin, ZoomJoinMixin, ZoomReportMixin):
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
            random_face_checks=zs.random_face_checks,
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
        zs.random_face_checks = data.random_face_checks
        zs.is_active = data.is_active
        current = {link.group_id: link for link in zs.group_links}
        for group_id, link in current.items():
            if group_id not in group_ids:
                zs.group_links.remove(link)
        for group_id in group_ids - set(current):
            zs.group_links.append(ZoomSessionGroup(group_id=group_id))

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


zoom_session_repository = ZoomSessionRepository()

