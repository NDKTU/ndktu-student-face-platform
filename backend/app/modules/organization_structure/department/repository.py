import logging

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.organization_structure.department.model import Department

from .schemas import (
    DepartmentCreateRequest,
    DepartmentListRequest,
    DepartmentListResponse,
    DepartmentUpdateRequest,
)

logger = logging.getLogger(__name__)


class DepartmentRepository:
    async def create_department(self, session: AsyncSession, data: DepartmentCreateRequest) -> Department:
        stmt_check = select(Department).where(Department.name == data.name)
        result_check = await session.execute(stmt_check)
        if result_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Department '{data.name}' already exists",
            )

        new_department = Department(name=data.name)
        session.add(new_department)

        try:
            await session.commit()
            await session.refresh(new_department)
        except IntegrityError as e:
            await session.rollback()
            logger.warning("Integrity error creating department %r: %s", data.name, e)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Department '{data.name}' conflicts with an existing record",
            )
        except SQLAlchemyError:
            await session.rollback()
            logger.exception("Database error creating department %r", data.name)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error",
            )
        return new_department

    async def get_department(self, session: AsyncSession, department_id: int) -> Department:
        stmt = select(Department).where(Department.id == department_id)
        result = await session.execute(stmt)
        department = result.scalar_one_or_none()

        if not department:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

        return department

    async def list_departments(
        self, session: AsyncSession, request: DepartmentListRequest
    ) -> DepartmentListResponse:
        stmt = select(Department)

        if request.name:
            stmt = stmt.where(Department.name.ilike(f"%{request.name}%"))

        stmt = stmt.order_by(desc(Department.created_at))
        stmt = stmt.offset(request.offset).limit(request.limit)

        result = await session.execute(stmt)
        departments = result.scalars().all()

        count_stmt = select(func.count()).select_from(Department)
        if request.name:
            count_stmt = count_stmt.where(Department.name.ilike(f"%{request.name}%"))

        total_result = await session.execute(count_stmt)
        total = total_result.scalar() or 0

        return DepartmentListResponse(total=total, page=request.page, limit=request.limit, departments=departments)

    async def update_department(
        self, session: AsyncSession, department_id: int, data: DepartmentUpdateRequest
    ) -> Department:
        stmt = select(Department).where(Department.id == department_id)
        result = await session.execute(stmt)
        department = result.scalar_one_or_none()

        if not department:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")

        if data.name is not None:
            stmt_check = select(Department).where(Department.name == data.name, Department.id != department_id)
            existing = (await session.execute(stmt_check)).scalar_one_or_none()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Department name already taken",
                )
            department.name = data.name

        await session.commit()
        await session.refresh(department)
        return department

    async def delete_department(self, session: AsyncSession, department_id: int) -> None:
        department = await self.get_department(session, department_id)
        await session.delete(department)
        await session.commit()


get_department_repository = DepartmentRepository()
