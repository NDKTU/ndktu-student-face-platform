import logging

from core.utils.external_guard import ensure_editable
from core.utils.lesson_guard import ensure_no_lessons
from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.organization_structure.model import Kafedra

from .schemas import (
    KafedraCreateRequest,
    KafedraListRequest,
    KafedraListResponse,
    KafedraStatsItem,
    KafedraStatsResponse,
)

logger = logging.getLogger(__name__)


class KafedraRepository:
    async def get_kafedra_stats(
        self, session: AsyncSession, faculty_id: int | None = None
    ) -> KafedraStatsResponse:
        """Return catalogue counters without downloading all related rows."""
        from app.modules.auth.model import Teacher
        from app.modules.organization_structure.model import Speciality

        kafedra_stmt = select(Kafedra.id)
        if faculty_id is not None:
            kafedra_stmt = kafedra_stmt.where(Kafedra.faculty_id == faculty_id)
        kafedra_ids = list((await session.execute(kafedra_stmt)).scalars().all())
        if not kafedra_ids:
            return KafedraStatsResponse(stats=[])

        speciality_rows = (
            await session.execute(
                select(Speciality.kafedra_id, func.count(Speciality.id))
                .where(Speciality.kafedra_id.in_(kafedra_ids))
                .group_by(Speciality.kafedra_id)
            )
        ).all()
        teacher_rows = (
            await session.execute(
                select(Teacher.kafedra_id, func.count(Teacher.id))
                .where(Teacher.kafedra_id.in_(kafedra_ids))
                .group_by(Teacher.kafedra_id)
            )
        ).all()
        specialities = dict(speciality_rows)
        teachers = dict(teacher_rows)
        return KafedraStatsResponse(
            stats=[
                KafedraStatsItem(
                    kafedra_id=kafedra_id,
                    speciality_count=specialities.get(kafedra_id, 0),
                    teacher_count=teachers.get(kafedra_id, 0),
                )
                for kafedra_id in kafedra_ids
            ]
        )

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

        new_kafedra = Kafedra(name=data.name, faculty_id=data.faculty_id)
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

        stmt = stmt.order_by(desc(Kafedra.created_at))
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

        ensure_editable(kafedra, "кафедры")

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

        ensure_editable(kafedra, "кафедры")

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
            from app.modules.auth.model import TeacherSubject
            from app.modules.organization_structure.model import TeacherGroup

            await ensure_no_lessons(session, "Bu kafedra o'qituvchilari", TeacherSubject.teacher_id.in_(teacher_ids))
            await session.execute(delete(TeacherSubject).where(TeacherSubject.teacher_id.in_(teacher_ids)))
            await session.execute(delete(TeacherGroup).where(TeacherGroup.teacher_id.in_(teacher_ids)))
            await session.execute(delete(Teacher).where(Teacher.id.in_(teacher_ids)))

        await session.delete(kafedra)
        await session.commit()


get_kafedra_repository = KafedraRepository()
