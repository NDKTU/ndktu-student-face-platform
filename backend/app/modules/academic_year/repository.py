import logging
from datetime import date

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.academic_year.model import AcademicYear, Semester
from app.modules.academic_year.utils import academic_period_for

from .schemas import (
    AcademicYearCreateRequest,
    AcademicYearListRequest,
    AcademicYearListResponse,
    AcademicYearResponse,
    AcademicYearUpdateRequest,
)

logger = logging.getLogger(__name__)


class AcademicYearRepository:
    async def _load(self, session: AsyncSession, year_id: int) -> AcademicYear:
        stmt = select(AcademicYear).options(selectinload(AcademicYear.semesters)).where(AcademicYear.id == year_id)
        result = (await session.execute(stmt)).scalar_one_or_none()
        if not result:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Academic year not found")
        return result

    async def create_year(self, session: AsyncSession, data: AcademicYearCreateRequest) -> AcademicYearResponse:
        if data.is_active:
            await session.execute(update(AcademicYear).values(is_active=False))
            # Deactivate all semesters as well, we will activate the new one later
            await session.execute(update(Semester).values(is_active=False))

        year = AcademicYear(
            name=data.name,
            start_date=data.start_date,
            end_date=data.end_date,
            is_active=data.is_active,
        )
        session.add(year)
        await session.flush()

        # If frontend provided semesters, use them. Otherwise, auto-create 2 semesters
        if data.semesters and len(data.semesters) == 2:
            for sem in data.semesters:
                session.add(
                    Semester(
                        academic_year_id=year.id,
                        number=sem.number,
                        start_date=sem.start_date,
                        end_date=sem.end_date,
                        is_active=(data.is_active and sem.number == 1) # Auto activate semester 1 if year is active
                    )
                )
        else:
            # Auto calculate mid date
            from datetime import timedelta
            total_days = (data.end_date - data.start_date).days
            mid_date = data.start_date + timedelta(days=total_days // 2)
            
            session.add(Semester(
                academic_year_id=year.id,
                number=1,
                start_date=data.start_date,
                end_date=mid_date,
                is_active=data.is_active
            ))
            session.add(Semester(
                academic_year_id=year.id,
                number=2,
                start_date=mid_date + timedelta(days=1),
                end_date=data.end_date,
                is_active=False
            ))

        try:
            await session.commit()
        except Exception as e:
            await session.rollback()
            logger.error(f"Error creating academic year: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database error: {e}",
            )

        loaded = await self._load(session, year.id)
        return AcademicYearResponse.model_validate(loaded)

    async def get_year(self, session: AsyncSession, year_id: int) -> AcademicYearResponse:
        return AcademicYearResponse.model_validate(await self._load(session, year_id))

    async def list_years(self, session: AsyncSession, request: AcademicYearListRequest) -> AcademicYearListResponse:
        stmt = select(AcademicYear).options(selectinload(AcademicYear.semesters))
        count_stmt = select(func.count()).select_from(AcademicYear)
        if request.is_active is not None:
            stmt = stmt.where(AcademicYear.is_active == request.is_active)
            count_stmt = count_stmt.where(AcademicYear.is_active == request.is_active)

        stmt = stmt.order_by(desc(AcademicYear.start_date)).offset(request.offset).limit(request.limit)
        years = (await session.execute(stmt)).scalars().all()
        total = (await session.execute(count_stmt)).scalar() or 0

        return AcademicYearListResponse(
            total=total,
            page=request.page,
            limit=request.limit,
            years=[AcademicYearResponse.model_validate(y) for y in years],
        )

    async def update_year(
        self, session: AsyncSession, year_id: int, data: AcademicYearUpdateRequest
    ) -> AcademicYearResponse:
        year = await self._load(session, year_id)

        if data.is_active is True and not year.is_active:
            await session.execute(update(AcademicYear).where(AcademicYear.id != year_id).values(is_active=False))

        for field in ("name", "start_date", "end_date", "is_active"):
            val = getattr(data, field)
            if val is not None:
                setattr(year, field, val)

        try:
            await session.commit()
        except Exception as e:
            await session.rollback()
            logger.error(f"Error updating academic year: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database error: {e}",
            )

        loaded = await self._load(session, year_id)
        return AcademicYearResponse.model_validate(loaded)

    async def delete_year(self, session: AsyncSession, year_id: int) -> None:
        year = await self._load(session, year_id)
        await session.delete(year)
        await session.commit()

    async def update_semester(
        self, session: AsyncSession, semester_id: int, data: "SemesterUpdateRequest"
    ) -> "SemesterResponse":
        stmt = select(Semester).where(Semester.id == semester_id)
        semester = (await session.execute(stmt)).scalar_one_or_none()
        if not semester:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Semester not found")

        if data.is_active is True and not semester.is_active:
            # Deactivate all other semesters across all years to ensure only one is active globally
            await session.execute(update(Semester).where(Semester.id != semester_id).values(is_active=False))

        for field in ("start_date", "end_date", "is_active"):
            val = getattr(data, field)
            if val is not None:
                setattr(semester, field, val)

        try:
            await session.commit()
        except Exception as e:
            await session.rollback()
            logger.error(f"Error updating semester: {e}")
            raise HTTPException(status_code=500, detail="Database error")

        from .schemas import SemesterResponse
        return SemesterResponse.model_validate(semester)

    async def _load_year_by_name(self, session: AsyncSession, name: str) -> AcademicYear | None:
        stmt = select(AcademicYear).options(selectinload(AcademicYear.semesters)).where(AcademicYear.name == name)
        return (await session.execute(stmt)).scalar_one_or_none()

    @staticmethod
    def _pick_current_semester(year: AcademicYear, today: date) -> Semester:
        """Choose the semester hosting ``today`` (by date range, then active, then first)."""
        for sem in year.semesters:
            if sem.start_date <= today <= sem.end_date:
                return sem
        for sem in year.semesters:
            if sem.is_active:
                return sem
        return min(year.semesters, key=lambda s: s.number)

    async def ensure_current_period(self, session: AsyncSession) -> Semester:
        """Return the semester for today, creating the academic year + semesters if missing.

        Used as the final fallback when a quiz is created and no semester matches the
        current date. The academic calendar is derived purely from today's date via
        ``academic_period_for``. Keeps the global "single active year + semester" invariant.
        """
        today = date.today()
        period = academic_period_for(today)

        existing = await self._load_year_by_name(session, period.name)
        if existing:
            return self._pick_current_semester(existing, today)

        # Deactivate everything before introducing the new active year (same pattern as create_year)
        await session.execute(update(AcademicYear).values(is_active=False))
        await session.execute(update(Semester).values(is_active=False))

        year = AcademicYear(
            name=period.name,
            start_date=period.start_date,
            end_date=period.end_date,
            is_active=True,
        )
        session.add(year)
        await session.flush()

        for sem in period.semesters:
            session.add(
                Semester(
                    academic_year_id=year.id,
                    number=sem.number,
                    start_date=sem.start_date,
                    end_date=sem.end_date,
                    is_active=(sem.number == period.active_number),
                )
            )

        try:
            await session.commit()
        except IntegrityError:
            # Concurrent request already created this year (UNIQUE name); reuse it.
            await session.rollback()
            existing = await self._load_year_by_name(session, period.name)
            if existing:
                return self._pick_current_semester(existing, today)
            raise

        loaded = await self._load_year_by_name(session, period.name)
        return self._pick_current_semester(loaded, today)


get_academic_year_repository = AcademicYearRepository()
