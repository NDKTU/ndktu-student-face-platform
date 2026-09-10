import logging

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utils.visibility import apply_visibility
from app.modules.auth.model import User
from app.modules.organization_structure.model import Curriculum

from .schemas import CurriculumListRequest, CurriculumListResponse

logger = logging.getLogger(__name__)


class CurriculumRepository:
    """Только чтение: планы приезжают из EPMOS и руками не правятся.

    Ни create, ни update здесь нет намеренно — следующая синхронизация молча
    вернула бы прежние значения, и расхождение обнаружилось бы не сразу.
    """

    async def get_curriculum(self, session: AsyncSession, curriculum_id: int) -> Curriculum:
        row = await session.get(Curriculum, curriculum_id)
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="O'quv reja topilmadi",
            )
        return row

    async def list_curriculums(
        self,
        session: AsyncSession,
        request: CurriculumListRequest,
        current_user: User,
    ) -> CurriculumListResponse:
        stmt = select(Curriculum)
        count_stmt = select(func.count()).select_from(Curriculum)

        stmt = apply_visibility(stmt, Curriculum, current_user, request.include_hidden)
        count_stmt = apply_visibility(count_stmt, Curriculum, current_user, request.include_hidden)

        # Фильтры по родителям берутся из полей самого плана, а не через JOIN:
        # факультет и кафедра проставлены на строке при синхронизации.
        filters = [
            (request.name, lambda v: Curriculum.name.ilike(f"%{v}%")),
            (request.speciality_id, lambda v: Curriculum.speciality_id == v),
            (request.kafedra_id, lambda v: Curriculum.kafedra_id == v),
            (request.faculty_id, lambda v: Curriculum.faculty_id == v),
            (request.education_form, lambda v: Curriculum.education_form == v),
            (request.education_type, lambda v: Curriculum.education_type == v),
        ]
        for value, condition in filters:
            if value:
                stmt = stmt.where(condition(value))
                count_stmt = count_stmt.where(condition(value))

        stmt = stmt.order_by(desc(Curriculum.created_at)).offset(request.offset).limit(request.limit)

        rows = (await session.execute(stmt)).scalars().all()
        total = (await session.execute(count_stmt)).scalar() or 0

        return CurriculumListResponse(
            total=total,
            page=request.page,
            limit=request.limit,
            curriculums=list(rows),
        )


get_curriculum_repository = CurriculumRepository()
