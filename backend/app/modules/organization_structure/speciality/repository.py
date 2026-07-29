import logging

from fastapi import HTTPException, status
from sqlalchemy import desc, func, join, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.organization_structure.model import Speciality

from .schemas import (
    SpecialityCreateRequest,
    SpecialityListRequest,
    SpecialityListResponse,
    SpecialityUpdateRequest,
)

logger = logging.getLogger(__name__)


class SpecialityRepository:
    async def create_speciality(self, session: AsyncSession, data: SpecialityCreateRequest) -> Speciality:
        stmt_check = select(Speciality).where(Speciality.name == data.name)
        if (await session.execute(stmt_check)).scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Speciality '{data.name}' already exists",
            )

        # position со server_default '0' поставил бы новую запись в начало
        # списка. Новая запись должна оказаться в конце — её место потом
        # меняют перетаскиванием, а не тем, что она только что создана.
        next_position = (
            await session.execute(
                select(func.coalesce(func.max(Speciality.position), 0) + 1).where(Speciality.kafedra_id == data.kafedra_id)
            )
        ).scalar_one()

        new_speciality = Speciality(
            name=data.name, kafedra_id=data.kafedra_id, position=next_position
        )
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

    async def list_specialities(
        self, session: AsyncSession, request: SpecialityListRequest
    ) -> SpecialityListResponse:
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

        # Порядок задаётся вручную (position), а не датой создания:
        # структуру университета читают сверху вниз, а не «сначала свежее».
        stmt = (
            stmt.order_by(Speciality.position, Speciality.id)
            .offset(request.offset)
            .limit(request.limit)
        )

        specialities = (await session.execute(stmt)).scalars().all()
        total = (await session.execute(count_stmt)).scalar() or 0

        return SpecialityListResponse(
            total=total, page=request.page, limit=request.limit, specialities=list(specialities)
        )

    async def update_speciality(
        self, session: AsyncSession, speciality_id: int, data: SpecialityUpdateRequest
    ) -> Speciality:
        speciality = await self.get_speciality(session, speciality_id)

        if data.name is not None:
            stmt_check = select(Speciality).where(
                Speciality.name == data.name, Speciality.id != speciality_id
            )
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
