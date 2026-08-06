import logging

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.job_title.model import JobTitle

from .schemas import (
    JobTitleCreateRequest,
    JobTitleListRequest,
    JobTitleListResponse,
    JobTitleUpdateRequest,
)

logger = logging.getLogger(__name__)


class JobTitleRepository:
    async def create_job_title(self, session: AsyncSession, data: JobTitleCreateRequest) -> JobTitle:
        stmt_check = select(JobTitle).where(JobTitle.name == data.name)
        result_check = await session.execute(stmt_check)
        if result_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"JobTitle '{data.name}' already exists",
            )

        new_job_title = JobTitle(name=data.name)
        session.add(new_job_title)

        try:
            await session.commit()
            await session.refresh(new_job_title)
        except IntegrityError as e:
            await session.rollback()
            logger.warning("Integrity error creating job_title %r: %s", data.name, e)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"JobTitle '{data.name}' conflicts with an existing record",
            )
        except SQLAlchemyError:
            await session.rollback()
            logger.exception("Database error creating job_title %r", data.name)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error",
            )
        return new_job_title

    async def get_job_title(self, session: AsyncSession, job_title_id: int) -> JobTitle:
        stmt = select(JobTitle).where(JobTitle.id == job_title_id)
        result = await session.execute(stmt)
        job_title = result.scalar_one_or_none()

        if not job_title:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="JobTitle not found")

        return job_title

    async def list_job_titles(
        self, session: AsyncSession, request: JobTitleListRequest
    ) -> JobTitleListResponse:
        stmt = select(JobTitle)

        if request.name:
            stmt = stmt.where(JobTitle.name.ilike(f"%{request.name}%"))

        stmt = stmt.order_by(desc(JobTitle.created_at))
        stmt = stmt.offset(request.offset).limit(request.limit)

        result = await session.execute(stmt)
        job_titles = result.scalars().all()

        count_stmt = select(func.count()).select_from(JobTitle)
        if request.name:
            count_stmt = count_stmt.where(JobTitle.name.ilike(f"%{request.name}%"))

        total_result = await session.execute(count_stmt)
        total = total_result.scalar() or 0

        return JobTitleListResponse(total=total, page=request.page, limit=request.limit, job_titles=job_titles)

    async def update_job_title(
        self, session: AsyncSession, job_title_id: int, data: JobTitleUpdateRequest
    ) -> JobTitle:
        stmt = select(JobTitle).where(JobTitle.id == job_title_id)
        result = await session.execute(stmt)
        job_title = result.scalar_one_or_none()

        if not job_title:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="JobTitle not found")

        if data.name is not None:
            stmt_check = select(JobTitle).where(JobTitle.name == data.name, JobTitle.id != job_title_id)
            existing = (await session.execute(stmt_check)).scalar_one_or_none()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="JobTitle name already taken",
                )
            job_title.name = data.name

        await session.commit()
        await session.refresh(job_title)
        return job_title

    async def delete_job_title(self, session: AsyncSession, job_title_id: int) -> None:
        job_title = await self.get_job_title(session, job_title_id)
        await session.delete(job_title)
        await session.commit()


get_job_title_repository = JobTitleRepository()
