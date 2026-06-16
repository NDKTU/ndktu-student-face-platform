import logging

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.education_plan.model import EducationPlan, EducationPlanSubject

from .schemas import (
    EducationPlanCreateRequest,
    EducationPlanListRequest,
    EducationPlanListResponse,
    EducationPlanResponse,
    EducationPlanSubjectCreateRequest,
    EducationPlanUpdateRequest,
)

logger = logging.getLogger(__name__)


class EducationPlanRepository:
    async def _load(self, session: AsyncSession, plan_id: int) -> EducationPlan:
        stmt = (
            select(EducationPlan)
            .options(selectinload(EducationPlan.subjects))
            .where(EducationPlan.id == plan_id)
        )
        plan = (await session.execute(stmt)).scalar_one_or_none()
        if not plan:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Education plan not found")
        return plan

    async def create_plan(self, session: AsyncSession, data: EducationPlanCreateRequest) -> EducationPlanResponse:
        plan = EducationPlan(
            speciality_id=data.speciality_id,
            name=data.name,
            year=data.year,
        )
        session.add(plan)
        await session.flush()

        for item in data.subjects:
            session.add(
                EducationPlanSubject(
                    education_plan_id=plan.id,
                    subject_id=item.subject_id,
                    semester=item.semester,
                )
            )

        try:
            await session.commit()
        except IntegrityError as e:
            await session.rollback()
            logger.warning("Integrity error creating education plan: %s", e)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Duplicate subject+semester combination or invalid FK",
            )
        except Exception as e:
            await session.rollback()
            logger.error("Error creating education plan: %s", e)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

        loaded = await self._load(session, plan.id)
        return EducationPlanResponse.model_validate(loaded)

    async def get_plan(self, session: AsyncSession, plan_id: int) -> EducationPlanResponse:
        plan = await self._load(session, plan_id)
        return EducationPlanResponse.model_validate(plan)

    async def list_plans(
        self, session: AsyncSession, request: EducationPlanListRequest
    ) -> EducationPlanListResponse:
        stmt = select(EducationPlan).options(selectinload(EducationPlan.subjects))
        count_stmt = select(func.count()).select_from(EducationPlan)

        if request.speciality_id:
            stmt = stmt.where(EducationPlan.speciality_id == request.speciality_id)
            count_stmt = count_stmt.where(EducationPlan.speciality_id == request.speciality_id)

        if request.year:
            stmt = stmt.where(EducationPlan.year == request.year)
            count_stmt = count_stmt.where(EducationPlan.year == request.year)

        stmt = stmt.order_by(desc(EducationPlan.created_at)).offset(request.offset).limit(request.limit)
        plans = (await session.execute(stmt)).scalars().all()
        total = (await session.execute(count_stmt)).scalar() or 0

        return EducationPlanListResponse(
            total=total,
            page=request.page,
            limit=request.limit,
            education_plans=[EducationPlanResponse.model_validate(p) for p in plans],
        )

    async def update_plan(
        self, session: AsyncSession, plan_id: int, data: EducationPlanUpdateRequest
    ) -> EducationPlanResponse:
        plan = await self._load(session, plan_id)

        if data.name is not None:
            plan.name = data.name
        if data.year is not None:
            plan.year = data.year
        if data.speciality_id is not None:
            plan.speciality_id = data.speciality_id

        try:
            await session.commit()
        except IntegrityError as e:
            await session.rollback()
            logger.warning("Integrity error updating plan %d: %s", plan_id, e)
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Update conflict")

        loaded = await self._load(session, plan_id)
        return EducationPlanResponse.model_validate(loaded)

    async def delete_plan(self, session: AsyncSession, plan_id: int) -> None:
        plan = await self._load(session, plan_id)
        await session.delete(plan)
        await session.commit()

    async def add_subject(
        self, session: AsyncSession, plan_id: int, data: EducationPlanSubjectCreateRequest
    ) -> EducationPlanResponse:
        await self._load(session, plan_id)

        stmt_check = select(EducationPlanSubject).where(
            EducationPlanSubject.education_plan_id == plan_id,
            EducationPlanSubject.subject_id == data.subject_id,
            EducationPlanSubject.semester == data.semester,
        )
        if (await session.execute(stmt_check)).scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Subject already exists in this plan for this semester",
            )

        session.add(
            EducationPlanSubject(
                education_plan_id=plan_id,
                subject_id=data.subject_id,
                semester=data.semester,
            )
        )
        try:
            await session.commit()
        except IntegrityError as e:
            await session.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Integrity error: {e}")

        loaded = await self._load(session, plan_id)
        return EducationPlanResponse.model_validate(loaded)

    async def remove_subject(self, session: AsyncSession, plan_id: int, plan_subject_id: int) -> None:
        stmt = select(EducationPlanSubject).where(
            EducationPlanSubject.id == plan_subject_id,
            EducationPlanSubject.education_plan_id == plan_id,
        )
        ps = (await session.execute(stmt)).scalar_one_or_none()
        if not ps:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Subject entry not found in this plan",
            )
        await session.delete(ps)
        await session.commit()


get_education_plan_repository = EducationPlanRepository()
