import logging

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.organization_structure.model import Kafedra

from .schemas import (
    KafedraCreateRequest,
    KafedraListRequest,
    KafedraListResponse,
)

logger = logging.getLogger(__name__)


class KafedraRepository:
    async def create_kafedra(self, session: AsyncSession, data: KafedraCreateRequest) -> Kafedra:
        stmt_check = select(Kafedra).where(Kafedra.name == data.name)
        result_check = await session.execute(stmt_check)
        if result_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Kafedra '{data.name}' already exists",
            )

        # Ideally verify faculty_id exists here, but FK constraint will handle it (though with 500 err)
        # For now, let's rely on basic creation.

        # position со server_default '0' поставил бы новую запись в начало
        # списка. Новая запись должна оказаться в конце — её место потом
        # меняют перетаскиванием, а не тем, что она только что создана.
        next_position = (
            await session.execute(
                select(func.coalesce(func.max(Kafedra.position), 0) + 1).where(Kafedra.faculty_id == data.faculty_id)
            )
        ).scalar_one()

        new_kafedra = Kafedra(
            name=data.name, faculty_id=data.faculty_id, position=next_position
        )
        session.add(new_kafedra)

        try:
            await session.commit()
            await session.refresh(new_kafedra)
        except IntegrityError as e:
            await session.rollback()
            logger.warning("Integrity error creating kafedra %r: %s", data.name, e)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Kafedra '{data.name}' conflicts with an existing record or invalid faculty_id",
            )
        except SQLAlchemyError:
            await session.rollback()
            logger.exception("Database error creating kafedra %r", data.name)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error",
            )
        return new_kafedra

    async def get_kafedra(self, session: AsyncSession, kafedra_id: int) -> Kafedra:
        stmt = select(Kafedra).where(Kafedra.id == kafedra_id)
        result = await session.execute(stmt)
        kafedra = result.scalar_one_or_none()

        if not kafedra:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kafedra not found")

        return kafedra

    async def list_kafedras(self, session: AsyncSession, request: KafedraListRequest) -> KafedraListResponse:
        stmt = select(Kafedra)

        if request.name:
            stmt = stmt.where(Kafedra.name.ilike(f"%{request.name}%"))

        if request.faculty_id:
            stmt = stmt.where(Kafedra.faculty_id == request.faculty_id)

        # Порядок задаётся вручную (position), а не датой создания:
        # структуру университета читают сверху вниз, а не «сначала свежее».
        stmt = stmt.order_by(Kafedra.position, Kafedra.id)
        stmt = stmt.offset(request.offset).limit(request.limit)

        result = await session.execute(stmt)
        kafedras = result.scalars().all()

        count_stmt = select(func.count()).select_from(Kafedra)
        if request.name:
            count_stmt = count_stmt.where(Kafedra.name.ilike(f"%{request.name}%"))
        if request.faculty_id:
            count_stmt = count_stmt.where(Kafedra.faculty_id == request.faculty_id)

        total_result = await session.execute(count_stmt)
        total = total_result.scalar() or 0

        return KafedraListResponse(total=total, page=request.page, limit=request.limit, kafedras=kafedras)

    async def update_kafedra(self, session: AsyncSession, kafedra_id: int, data: KafedraCreateRequest) -> Kafedra:
        stmt = select(Kafedra).where(Kafedra.id == kafedra_id)
        result = await session.execute(stmt)
        kafedra = result.scalar_one_or_none()

        if not kafedra:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kafedra not found")

        if data.name is not None:
            # Check unique name excluding current
            stmt_check = select(Kafedra).where(Kafedra.name == data.name, Kafedra.id != kafedra_id)
            existing = (await session.execute(stmt_check)).scalar_one_or_none()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Kafedra name already taken",
                )
            kafedra.name = data.name

        if data.faculty_id is not None:
            kafedra.faculty_id = data.faculty_id

        await session.commit()
        await session.refresh(kafedra)
        return kafedra

    async def delete_kafedra(self, session: AsyncSession, kafedra_id: int, force: bool = False) -> None:
        from sqlalchemy import delete

        from app.modules.auth.model import Teacher

        stmt = select(Kafedra).where(Kafedra.id == kafedra_id)
        result = await session.execute(stmt)
        kafedra = result.scalar_one_or_none()

        if not kafedra:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kafedra not found")

        if not force:
            teacher_count = (
                await session.execute(select(func.count(Teacher.id)).where(Teacher.kafedra_id == kafedra_id))
            ).scalar() or 0
            if teacher_count > 0:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "requires_confirmation": True,
                        "message": "Ushbu kafedrani o'chirish quyidagi bog'langan ma'lumotlarga ta'sir qiladi:",
                        "warnings": [
                            f"{teacher_count} ta o'qituvchi(lar) va ularning barcha guruh/fan biriktirmalari o'chiladi"
                        ],
                    },
                )

        # Aggressive delete Teachers and their links
        teacher_ids = (
            (await session.execute(select(Teacher.id).where(Teacher.kafedra_id == kafedra_id))).scalars().all()
        )
        if teacher_ids:
            from app.modules.organization_structure.model import GroupTeacher
            from app.modules.quiz.model import SubjectTeacher

            await session.execute(delete(SubjectTeacher).where(SubjectTeacher.teacher_id.in_(teacher_ids)))
            await session.execute(delete(GroupTeacher).where(GroupTeacher.teacher_id.in_(teacher_ids)))
            await session.execute(delete(Teacher).where(Teacher.id.in_(teacher_ids)))

        await session.delete(kafedra)
        await session.commit()


get_kafedra_repository = KafedraRepository()
