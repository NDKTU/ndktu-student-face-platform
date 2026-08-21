import logging

from core.utils.external_guard import ensure_editable
from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.organization_structure.model import Speciality

from .schemas import (
    SpecialityCreateRequest,
    SpecialityListRequest,
    SpecialityListResponse,
    SpecialityStatsItem,
    SpecialityStatsResponse,
    SpecialityUpdateRequest,
)

logger = logging.getLogger(__name__)


class SpecialityRepository:
    async def get_speciality_stats(
        self, session: AsyncSession, kafedra_id: int | None = None
    ) -> SpecialityStatsResponse:
        """Return group and student totals for speciality cards."""
        from app.modules.auth.model import Student
        from app.modules.organization_structure.model import Group

        speciality_stmt = select(Speciality.id)
        if kafedra_id is not None:
            speciality_stmt = speciality_stmt.where(Speciality.kafedra_id == kafedra_id)
        speciality_ids = list((await session.execute(speciality_stmt)).scalars().all())
        if not speciality_ids:
            return SpecialityStatsResponse(stats=[])

        group_rows = (
            await session.execute(
                select(Group.speciality_id, func.count(Group.id))
                .where(Group.speciality_id.in_(speciality_ids))
                .group_by(Group.speciality_id)
            )
        ).all()
        student_rows = (
            await session.execute(
                select(Group.speciality_id, func.count(Student.id))
                .join(Student, Student.group_id == Group.id)
                .where(Group.speciality_id.in_(speciality_ids))
                .group_by(Group.speciality_id)
            )
        ).all()
        groups = dict(group_rows)
        students = dict(student_rows)
        return SpecialityStatsResponse(
            stats=[
                SpecialityStatsItem(
                    speciality_id=speciality_id,
                    group_count=groups.get(speciality_id, 0),
                    student_count=students.get(speciality_id, 0),
                )
                for speciality_id in speciality_ids
            ]
        )

    async def create_speciality(self, session: AsyncSession, data: SpecialityCreateRequest) -> Speciality:
        stmt_check = select(Speciality).where(Speciality.name == data.name)
        if (await session.execute(stmt_check)).scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Speciality '{data.name}' already exists",
            )

        new_speciality = Speciality(name=data.name, kafedra_id=data.kafedra_id)
        session.add(new_speciality)

        try:
            await session.commit()
            await session.refresh(new_speciality)
        except IntegrityError as e:
            await session.rollback()
            logger.warning("Integrity error creating speciality %r: %s", data.name, e)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Speciality '{data.name}' conflicts with an existing record or invalid kafedra_id",
            )
        except SQLAlchemyError:
            await session.rollback()
            logger.exception("Database error creating speciality %r", data.name)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error",
            )
        return new_speciality

    async def get_speciality(self, session: AsyncSession, speciality_id: int) -> Speciality:
        stmt = select(Speciality).where(Speciality.id == speciality_id)
        speciality = (await session.execute(stmt)).scalar_one_or_none()
        if not speciality:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Speciality not found")
        return speciality

    async def list_specialities(self, session: AsyncSession, request: SpecialityListRequest) -> SpecialityListResponse:
        from app.modules.organization_structure.model import Kafedra

        stmt = select(Speciality)
        count_stmt = select(func.count()).select_from(Speciality)

        if request.name:
            stmt = stmt.where(Speciality.name.ilike(f"%{request.name}%"))
            count_stmt = count_stmt.where(Speciality.name.ilike(f"%{request.name}%"))

        if request.kafedra_id:
            stmt = stmt.where(Speciality.kafedra_id == request.kafedra_id)
            count_stmt = count_stmt.where(Speciality.kafedra_id == request.kafedra_id)

        if request.faculty_id:
            stmt = stmt.join(Kafedra, Speciality.kafedra_id == Kafedra.id).where(
                Kafedra.faculty_id == request.faculty_id
            )
            count_stmt = count_stmt.join(Kafedra, Speciality.kafedra_id == Kafedra.id).where(
                Kafedra.faculty_id == request.faculty_id
            )

        stmt = stmt.order_by(desc(Speciality.created_at)).offset(request.offset).limit(request.limit)

        specialities = (await session.execute(stmt)).scalars().all()
        total = (await session.execute(count_stmt)).scalar() or 0

        return SpecialityListResponse(
            total=total, page=request.page, limit=request.limit, specialities=list(specialities)
        )

    async def update_speciality(
        self, session: AsyncSession, speciality_id: int, data: SpecialityUpdateRequest
    ) -> Speciality:
        speciality = await self.get_speciality(session, speciality_id)
        ensure_editable(speciality, "специальности")

        if data.name is not None:
            stmt_check = select(Speciality).where(Speciality.name == data.name, Speciality.id != speciality_id)
            if (await session.execute(stmt_check)).scalar_one_or_none():
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Speciality name already taken",
                )
            speciality.name = data.name

        if data.kafedra_id is not None:
            speciality.kafedra_id = data.kafedra_id

        try:
            await session.commit()
            await session.refresh(speciality)
        except IntegrityError as e:
            await session.rollback()
            logger.warning("Integrity error updating speciality %d: %s", speciality_id, e)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Update conflicts with existing record or invalid kafedra_id",
            )
        return speciality

    async def delete_speciality(self, session: AsyncSession, speciality_id: int) -> None:
        speciality = await self.get_speciality(session, speciality_id)
        ensure_editable(speciality, "специальности")
        try:
            await session.delete(speciality)
            await session.commit()
        except IntegrityError:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot delete: speciality is referenced by other records",
            )


get_speciality_repository = SpecialityRepository()
