import logging

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.organization_structure.curriculum.model import Curriculum
from app.modules.organization_structure.speciality.model import Speciality
from app.modules.auth.teacher.model import Teacher
from app.modules.quiz.subject.model import Subject

from .schemas import (
    CurriculumCreateRequest,
    CurriculumListRequest,
    CurriculumListResponse,
    CurriculumUpdateRequest,
)

logger = logging.getLogger(__name__)


class CurriculumRepository:
    async def _resolve_subject_name(
        self, session: AsyncSession, subject_id: int | None, subject_name: str | None
    ) -> str:
        """Название строки плана: из справочника, если фан выбран, иначе введённое.

        Хранить его обязательно: план — документ, и переименование фана не
        должно менять уже утверждённые строки задним числом.
        """
        if subject_id is not None:
            subject = await session.get(Subject, subject_id)
            if subject is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Subject {subject_id} not found",
                )
            return subject.name

        if not subject_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either subject_id or subject_name is required",
            )
        return subject_name

    async def create_row(
        self, session: AsyncSession, data: CurriculumCreateRequest
    ) -> Curriculum:
        if await session.get(Speciality, data.speciality_id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Speciality {data.speciality_id} not found",
            )

        subject_name = await self._resolve_subject_name(session, data.subject_id, data.subject_name)

        # Новая строка встаёт в конец своего семестра.
        next_position = (
            await session.execute(
                select(func.coalesce(func.max(Curriculum.position), 0) + 1).where(
                    Curriculum.speciality_id == data.speciality_id,
                    Curriculum.semester == data.semester,
                )
            )
        ).scalar_one()

        row = Curriculum(
            speciality_id=data.speciality_id,
            subject_id=data.subject_id,
            subject_name=subject_name,
            semester=data.semester,
            credit=data.credit,
            teacher_id=data.teacher_id,
            position=next_position,
        )
        session.add(row)

        try:
            await session.commit()
        except IntegrityError as e:
            await session.rollback()
            logger.warning("Integrity error creating curriculum row: %s", e)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Bu fan ushbu semestrda allaqachon mavjud",
            )
        except SQLAlchemyError:
            await session.rollback()
            logger.exception("Database error creating curriculum row")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Database error"
            )

        return await self.get_row(session, row.id)

    async def get_row(self, session: AsyncSession, row_id: int) -> Curriculum:
        stmt = (
            select(Curriculum)
            .options(selectinload(Curriculum.subject),
            selectinload(Curriculum.teacher).selectinload(Teacher.employee))
            .where(Curriculum.id == row_id)
        )
        row = (await session.execute(stmt)).scalar_one_or_none()
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Curriculum row not found"
            )
        return row

    async def list_rows(
        self, session: AsyncSession, request: CurriculumListRequest
    ) -> CurriculumListResponse:
        stmt = select(Curriculum).options(selectinload(Curriculum.subject),
            selectinload(Curriculum.teacher).selectinload(Teacher.employee))
        count_stmt = select(func.count()).select_from(Curriculum)

        for column, value in (
            (Curriculum.speciality_id, request.speciality_id),
            (Curriculum.semester, request.semester),
            (Curriculum.subject_id, request.subject_id),
        ):
            if value is not None:
                stmt = stmt.where(column == value)
                count_stmt = count_stmt.where(column == value)

        # План читают по семестрам сверху вниз — порядок здесь смысловой,
        # а не «сначала самое свежее», как в остальных списках.
        stmt = (
            stmt.order_by(Curriculum.semester, Curriculum.position, Curriculum.id)
            .offset(request.offset)
            .limit(request.limit)
        )

        rows = (await session.execute(stmt)).scalars().all()
        total = (await session.execute(count_stmt)).scalar() or 0

        return CurriculumListResponse(
            total=total, page=request.page, limit=request.limit, curriculum=list(rows)
        )

    async def update_row(
        self, session: AsyncSession, row_id: int, data: CurriculumUpdateRequest
    ) -> Curriculum:
        row = await self.get_row(session, row_id)

        # subject_id меняется вместе с названием: иначе в плане осталась бы
        # подпись от прежнего фана.
        if data.subject_id is not None or data.subject_name is not None:
            row.subject_id = data.subject_id
            row.subject_name = await self._resolve_subject_name(
                session, data.subject_id, data.subject_name or row.subject_name
            )

        for field in ("semester", "credit", "teacher_id", "position"):
            value = getattr(data, field)
            if value is not None:
                setattr(row, field, value)

        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Bu fan ushbu semestrda allaqachon mavjud",
            )

        return await self.get_row(session, row_id)

    async def delete_row(self, session: AsyncSession, row_id: int) -> None:
        row = await self.get_row(session, row_id)
        await session.delete(row)
        await session.commit()

    async def clear(
        self, session: AsyncSession, speciality_id: int, semester: int | None = None
    ) -> int:
        """Очистка плана целиком или одного семестра. Возвращает число удалённых строк."""
        stmt = select(Curriculum).where(Curriculum.speciality_id == speciality_id)
        if semester is not None:
            stmt = stmt.where(Curriculum.semester == semester)

        rows = (await session.execute(stmt)).scalars().all()
        for row in rows:
            await session.delete(row)
        await session.commit()
        return len(rows)

    async def reorder(self, session: AsyncSession, ids: list[int]) -> None:
        rows = (
            (await session.execute(select(Curriculum).where(Curriculum.id.in_(ids))))
            .scalars()
            .all()
        )
        by_id = {row.id: row for row in rows}

        missing = [row_id for row_id in ids if row_id not in by_id]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Curriculum rows not found: {missing}",
            )

        for index, row_id in enumerate(ids, start=1):
            by_id[row_id].position = index

        await session.commit()


get_curriculum_repository = CurriculumRepository()
