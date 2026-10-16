"""Webhook qatnashuv hodisalari va seans hisoboti (yuz tekshiruvi + Zoom'dagi vaqt)."""

from datetime import datetime, timezone

from sqlalchemy import desc, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.mixins.time_stamp_mixin import utcnow_naive
from app.core.utils.face_absence import build_absence_spans, spans_total_seconds
from app.modules.auth.model import Student, User

from .accounts import (
    credentials_by_id,
)
from .model import ZoomFaceCheck, ZoomParticipantEvent, ZoomRegistrant, ZoomSession
from .schemas import (
    AbsencePeriod,
    FaceCheckReportResponse,
    FaceCheckStudentSummary,
    ZoomOutsider,
)
from .common import EARLY_JOIN, LEFT_EARLY_GAP_SECONDS, EVENT_MATCH_BEFORE, EVENT_MATCH_AFTER, CUSTOMER_KEY_PREFIX, _PARTICIPANT_EVENTS, _FAILED, _parse_zoom_time


class ZoomReportMixin:
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
