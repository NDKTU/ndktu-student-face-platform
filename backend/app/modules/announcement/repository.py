import logging
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.mixins.time_stamp_mixin import to_naive_utc, utcnow_naive
from app.modules.auth.model import Student, User
from app.modules.organization_structure.model import Group

from .model import Announcement, AnnouncementRegistration
from .schemas import (
    AnnouncementCreateRequest,
    AnnouncementFeedRequest,
    AnnouncementListRequest,
    AnnouncementListResponse,
    AnnouncementResponse,
    AnnouncementUpdateRequest,
    RegistrationListResponse,
    RegistrationResponse,
    RegistrationStudentInfo,
)
from .schemas import AudienceGroupOption, AudienceOptionsResponse

logger = logging.getLogger(__name__)

#: Vaqt maydonlari — `datetime` ustunlari, ular naive UTC saqlanadi.
_DATETIME_FIELDS = ("publish_at", "expires_at", "event_at", "registration_deadline")


class AnnouncementRepository:
    # ─── helpers ─────────────────────────────────────────────────────────────

    async def _get_orm(self, session: AsyncSession, announcement_id: int) -> Announcement:
        row = (
            await session.execute(select(Announcement).where(Announcement.id == announcement_id))
        ).scalar_one_or_none()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="E'lon topilmadi")
        return row

    async def _counts(self, session: AsyncSession, announcement_ids: list[int]) -> dict[int, int]:
        """Har bir e'lon uchun faol yozilishlar soni.

        Bitta so'rov bilan olinadi: ro'yxatdagi har element uchun alohida
        `count(*)` yuborilsa, yigirma qatorli sahifa yigirma so'rov berardi.
        """
        if not announcement_ids:
            return {}
        stmt = (
            select(AnnouncementRegistration.announcement_id, func.count())
            .where(
                AnnouncementRegistration.announcement_id.in_(announcement_ids),
                AnnouncementRegistration.status == "registered",
            )
            .group_by(AnnouncementRegistration.announcement_id)
        )
        return {row[0]: row[1] for row in (await session.execute(stmt)).all()}

    async def _my_registrations(
        self, session: AsyncSession, user_id: int, announcement_ids: list[int]
    ) -> set[int]:
        if not announcement_ids:
            return set()
        stmt = select(AnnouncementRegistration.announcement_id).where(
            AnnouncementRegistration.announcement_id.in_(announcement_ids),
            AnnouncementRegistration.user_id == user_id,
            AnnouncementRegistration.status == "registered",
        )
        return set((await session.execute(stmt)).scalars().all())

    def _to_response(
        self,
        row: Announcement,
        *,
        registered_count: int = 0,
        is_registered: bool = False,
        now: datetime | None = None,
    ) -> AnnouncementResponse:
        now = now or utcnow_naive()
        seats_left = None if row.capacity is None else max(row.capacity - registered_count, 0)
        deadline_passed = row.registration_deadline is not None and row.registration_deadline <= now
        registration_open = bool(
            row.registration_enabled
            and row.status == "published"
            and not deadline_passed
            and (seats_left is None or seats_left > 0)
        )
        response = AnnouncementResponse.model_validate(row)
        response.registered_count = registered_count
        response.seats_left = seats_left
        response.is_registered = is_registered
        response.registration_open = registration_open
        return response

    def _visible_now(self, stmt: Select, now: datetime) -> Select:
        """Faqat chop etilgan va ko'rsatish oynasidagi e'lonlar."""
        return stmt.where(
            Announcement.status == "published",
            or_(Announcement.publish_at.is_(None), Announcement.publish_at <= now),
            or_(Announcement.expires_at.is_(None), Announcement.expires_at > now),
        )

    async def _audience_filter(self, session: AsyncSession, user: User):
        """Talabaning guruhi/fakulteti/kursiga mos e'lonlar sharti.

        Talaba qatori bo'lmagan foydalanuvchi (masalan, admin lentani ko'rmoqchi
        bo'lsa) faqat «hammaga» e'lonlarini oladi: fakultet ham, guruh ham
        noma'lum, taxmin qilib ko'rsatish noto'g'ri auditoriyani chalg'itardi.
        """
        student = (
            await session.execute(select(Student).where(Student.user_id == user.id))
        ).scalar_one_or_none()

        conditions = [Announcement.audience_kind == "all"]
        if student is None:
            return or_(*conditions)

        if student.group_id is not None:
            conditions.append(
                and_(
                    Announcement.audience_kind == "group",
                    Announcement.audience_values.contains([student.group_id]),
                )
            )
        if student.faculty:
            conditions.append(
                and_(
                    Announcement.audience_kind == "faculty",
                    Announcement.audience_values.contains([student.faculty]),
                )
            )
        if student.level:
            conditions.append(
                and_(
                    Announcement.audience_kind == "level",
                    Announcement.audience_values.contains([student.level]),
                )
            )
        return or_(*conditions)

    def _validate(self, data: dict) -> None:
        publish_at = data.get("publish_at")
        expires_at = data.get("expires_at")
        if publish_at and expires_at and expires_at <= publish_at:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ko'rsatish muddati boshlanish vaqtidan keyin bo'lishi kerak",
            )

    # ─── management ──────────────────────────────────────────────────────────

    async def create(
        self, session: AsyncSession, data: AnnouncementCreateRequest, user: User
    ) -> AnnouncementResponse:
        payload = data.model_dump()
        for field in _DATETIME_FIELDS:
            payload[field] = to_naive_utc(payload.get(field))
        self._validate(payload)

        row = Announcement(**payload, created_by_user_id=user.id)
        session.add(row)
        await session.commit()
        await session.refresh(row)
        return self._to_response(row)

    async def update(
        self, session: AsyncSession, announcement_id: int, data: AnnouncementUpdateRequest
    ) -> AnnouncementResponse:
        row = await self._get_orm(session, announcement_id)
        payload = data.model_dump(exclude_unset=True)
        for field in _DATETIME_FIELDS:
            if field in payload:
                payload[field] = to_naive_utc(payload[field])

        merged = {
            "publish_at": payload.get("publish_at", row.publish_at),
            "expires_at": payload.get("expires_at", row.expires_at),
        }
        self._validate(merged)

        if "capacity" in payload and payload["capacity"] is not None:
            registered = (await self._counts(session, [row.id])).get(row.id, 0)
            if payload["capacity"] < registered:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Joylar soni yozilganlar sonidan kam bo'lishi mumkin emas ({registered} ta yozilgan)",
                )

        for field, value in payload.items():
            setattr(row, field, value)

        await session.commit()
        await session.refresh(row)
        registered = (await self._counts(session, [row.id])).get(row.id, 0)
        return self._to_response(row, registered_count=registered)

    async def delete(self, session: AsyncSession, announcement_id: int) -> None:
        row = await self._get_orm(session, announcement_id)
        await session.delete(row)
        await session.commit()

    async def get(self, session: AsyncSession, announcement_id: int) -> AnnouncementResponse:
        row = await self._get_orm(session, announcement_id)
        registered = (await self._counts(session, [row.id])).get(row.id, 0)
        return self._to_response(row, registered_count=registered)

    async def list_all(
        self, session: AsyncSession, request: AnnouncementListRequest
    ) -> AnnouncementListResponse:
        stmt = select(Announcement)
        if request.status:
            stmt = stmt.where(Announcement.status == request.status)
        if request.search:
            stmt = stmt.where(Announcement.title.ilike(f"%{request.search.strip()}%"))

        total = (await session.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
        rows = (
            (
                await session.execute(
                    stmt.order_by(Announcement.pinned.desc(), Announcement.created_at.desc())
                    .offset(request.offset)
                    .limit(request.limit)
                )
            )
            .scalars()
            .all()
        )

        counts = await self._counts(session, [row.id for row in rows])
        now = utcnow_naive()
        return AnnouncementListResponse(
            total=total,
            page=request.page,
            limit=request.limit,
            announcements=[
                self._to_response(row, registered_count=counts.get(row.id, 0), now=now) for row in rows
            ],
        )

    # ─── student feed ────────────────────────────────────────────────────────

    async def feed(
        self, session: AsyncSession, request: AnnouncementFeedRequest, user: User
    ) -> AnnouncementListResponse:
        now = utcnow_naive()
        stmt = self._visible_now(select(Announcement), now).where(
            await self._audience_filter(session, user)
        )
        if request.only_events:
            stmt = stmt.where(Announcement.registration_enabled.is_(True))

        total = (await session.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
        rows = (
            (
                await session.execute(
                    # Qadalganlar tepada, keyin yangi e'lonlar.
                    stmt.order_by(Announcement.pinned.desc(), Announcement.created_at.desc())
                    .offset(request.offset)
                    .limit(request.limit)
                )
            )
            .scalars()
            .all()
        )

        ids = [row.id for row in rows]
        counts = await self._counts(session, ids)
        mine = await self._my_registrations(session, user.id, ids)
        return AnnouncementListResponse(
            total=total,
            page=request.page,
            limit=request.limit,
            announcements=[
                self._to_response(
                    row,
                    registered_count=counts.get(row.id, 0),
                    is_registered=row.id in mine,
                    now=now,
                )
                for row in rows
            ],
        )

    async def feed_item(
        self, session: AsyncSession, announcement_id: int, user: User
    ) -> AnnouncementResponse:
        now = utcnow_naive()
        stmt = self._visible_now(select(Announcement), now).where(
            Announcement.id == announcement_id,
            await self._audience_filter(session, user),
        )
        row = (await session.execute(stmt)).scalar_one_or_none()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="E'lon topilmadi")

        counts = await self._counts(session, [row.id])
        mine = await self._my_registrations(session, user.id, [row.id])
        return self._to_response(
            row,
            registered_count=counts.get(row.id, 0),
            is_registered=row.id in mine,
            now=now,
        )

    # ─── registration ────────────────────────────────────────────────────────

    async def register(
        self, session: AsyncSession, announcement_id: int, user: User
    ) -> AnnouncementResponse:
        now = utcnow_naive()
        # Auditoriya va ko'rsatish oynasi shu yerda ham tekshiriladi: lentani
        # chetlab o'tib to'g'ridan-to'g'ri so'rov yuborish mumkin.
        current = await self.feed_item(session, announcement_id, user)
        if not current.registration_enabled:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Bu e'londa ro'yxatdan o'tish yo'q"
            )
        if current.is_registered:
            return current

        row = await self._get_orm(session, announcement_id)
        if row.registration_deadline is not None and row.registration_deadline <= now:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Ro'yxatdan o'tish muddati tugagan"
            )

        existing = (
            await session.execute(
                select(AnnouncementRegistration).where(
                    AnnouncementRegistration.announcement_id == announcement_id,
                    AnnouncementRegistration.user_id == user.id,
                )
            )
        ).scalar_one_or_none()

        # Joy bandligi yozishdan oldin qayta sanaladi: lenta ochilgandan beri
        # oxirgi joy boshqasiga ketgan bo'lishi mumkin.
        if row.capacity is not None:
            registered = (await self._counts(session, [row.id])).get(row.id, 0)
            if registered >= row.capacity:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT, detail="Joylar tugagan"
                )

        if existing:
            existing.status = "registered"
        else:
            session.add(
                AnnouncementRegistration(
                    announcement_id=announcement_id, user_id=user.id, status="registered"
                )
            )
        await session.commit()
        return await self.feed_item(session, announcement_id, user)

    async def cancel(
        self, session: AsyncSession, announcement_id: int, user: User
    ) -> AnnouncementResponse:
        existing = (
            await session.execute(
                select(AnnouncementRegistration).where(
                    AnnouncementRegistration.announcement_id == announcement_id,
                    AnnouncementRegistration.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
        if existing and existing.status != "cancelled":
            existing.status = "cancelled"
            await session.commit()
        return await self.feed_item(session, announcement_id, user)

    async def audience_options(self, session: AsyncSession) -> AudienceOptionsResponse:
        faculties = [
            value
            for value in (
                await session.execute(
                    select(Student.faculty).where(Student.faculty.isnot(None)).distinct().order_by(Student.faculty)
                )
            ).scalars()
            if value
        ]
        levels = [
            value
            for value in (
                await session.execute(
                    select(Student.level).where(Student.level.isnot(None)).distinct().order_by(Student.level)
                )
            ).scalars()
            if value
        ]
        groups = (
            (await session.execute(select(Group).order_by(Group.name))).scalars().all()
        )
        return AudienceOptionsResponse(
            faculties=faculties,
            levels=levels,
            groups=[AudienceGroupOption(id=group.id, name=group.name) for group in groups],
        )

    async def list_registrations(
        self, session: AsyncSession, announcement_id: int
    ) -> RegistrationListResponse:
        await self._get_orm(session, announcement_id)
        rows = (
            (
                await session.execute(
                    select(AnnouncementRegistration)
                    .options(selectinload(AnnouncementRegistration.user).selectinload(User.student))
                    .where(AnnouncementRegistration.announcement_id == announcement_id)
                    .order_by(AnnouncementRegistration.created_at)
                )
            )
            .scalars()
            .all()
        )

        group_ids = {
            row.user.student.group_id
            for row in rows
            if row.user and row.user.student and row.user.student.group_id
        }
        groups: dict[int, str] = {}
        if group_ids:
            groups = {
                group.id: group.name
                for group in (
                    await session.execute(select(Group).where(Group.id.in_(group_ids)))
                ).scalars()
            }

        items: list[RegistrationResponse] = []
        for row in rows:
            student = row.user.student if row.user else None
            items.append(
                RegistrationResponse(
                    id=row.id,
                    user_id=row.user_id,
                    username=row.user.username if row.user else None,
                    status=row.status,
                    created_at=row.created_at,
                    student=(
                        RegistrationStudentInfo(
                            full_name=student.full_name,
                            group_name=groups.get(student.group_id) if student.group_id else None,
                            faculty=student.faculty,
                            level=student.level,
                        )
                        if student
                        else None
                    ),
                )
            )

        return RegistrationListResponse(
            total=len(items),
            active_total=sum(1 for item in items if item.status == "registered"),
            registrations=items,
        )


get_announcement_repository = AnnouncementRepository()
