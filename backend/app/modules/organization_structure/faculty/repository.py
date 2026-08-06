import logging

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.schemas import normalized_name
from app.modules.organization_structure.faculty.model import Faculty

from .schemas import (
    FacultyCreateRequest,
    FacultyListRequest,
    FacultyListResponse,
    FacultyUpdateRequest,
)

logger = logging.getLogger(__name__)


class FacultyRepository:
    async def create_faculty(self, session: AsyncSession, data: FacultyCreateRequest) -> Faculty:
        stmt_check = select(Faculty).where(func.lower(Faculty.name) == data.name.lower())
        result_check = await session.execute(stmt_check)
        if result_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Faculty '{data.name}' already exists",
            )

        # position со server_default '0' поставил бы новую запись в начало
        # списка. Новая запись должна оказаться в конце — её место потом
        # меняют перетаскиванием, а не тем, что она только что создана.
        next_position = (
            await session.execute(
                select(func.coalesce(func.max(Faculty.position), 0) + 1)
            )
        ).scalar_one()

        await self._ensure_dekan_free(session, data.dekan_employee_id)

        new_faculty = Faculty(name=data.name, position=next_position)
        # Необязательные поля карточки переносим списком: перечислять их
        # по одному в конструкторе значило бы забывать новое поле при каждом
        # расширении схемы.
        for _field in ('code', 'dekan_employee_id', 'color_bg', 'color_fg'):
            _value = getattr(data, _field, None)
            if _value is not None:
                setattr(new_faculty, _field, _value)
        session.add(new_faculty)

        try:
            await session.commit()
            await session.refresh(new_faculty)
        except IntegrityError as e:
            await session.rollback()
            logger.warning("Integrity error creating faculty %r: %s", data.name, e)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Faculty '{data.name}' conflicts with an existing record",
            )
        except SQLAlchemyError:
            await session.rollback()
            logger.exception("Database error creating faculty %r", data.name)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error",
            )
        return new_faculty

    async def get_faculty(self, session: AsyncSession, faculty_id: int) -> Faculty:
        stmt = select(Faculty).where(Faculty.id == faculty_id)
        result = await session.execute(stmt)
        faculty = result.scalar_one_or_none()

        if not faculty:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Faculty not found")

        return faculty

    async def list_faculties(self, session: AsyncSession, request: FacultyListRequest) -> FacultyListResponse:
        stmt = select(Faculty)

        if request.name:
            stmt = stmt.where(Faculty.name.ilike(f"%{request.name}%"))

        # Порядок задаётся вручную (position), а не датой создания:
        # структуру университета читают сверху вниз, а не «сначала свежее».
        stmt = stmt.order_by(Faculty.position, Faculty.id)
        stmt = stmt.offset(request.offset).limit(request.limit)

        result = await session.execute(stmt)
        faculties = result.scalars().all()

        count_stmt = select(func.count()).select_from(Faculty)
        if request.name:
            count_stmt = count_stmt.where(Faculty.name.ilike(f"%{request.name}%"))

        total_result = await session.execute(count_stmt)
        total = total_result.scalar() or 0

        return FacultyListResponse(total=total, page=request.page, limit=request.limit, faculties=faculties)

    async def update_faculty(self, session: AsyncSession, faculty_id: int, data: FacultyUpdateRequest) -> Faculty:
        stmt = select(Faculty).where(Faculty.id == faculty_id)
        result = await session.execute(stmt)
        faculty = result.scalar_one_or_none()

        if not faculty:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Faculty not found")

        if data.name is not None:
            stmt_check = select(Faculty).where(
                func.lower(Faculty.name) == data.name.lower(), Faculty.id != faculty_id
            )
            existing_faculty = (await session.execute(stmt_check)).scalar_one_or_none()
            if existing_faculty:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Faculty name already taken",
                )
            faculty.name = data.name

        if 'dekan_employee_id' in data.model_fields_set:
            await self._ensure_dekan_free(session, data.dekan_employee_id, exclude_faculty_id=faculty_id)

        # Смотрим на то, что реально пришло в теле, а не на значение. `None` и
        # «поле не прислали» — разные намерения: первое означает «очистить»,
        # второе «не трогать». По значению их не различить, и снять декана с
        # факультета было нечем.
        for _field in ('code', 'dekan_employee_id', 'color_bg', 'color_fg'):
            if _field in data.model_fields_set:
                setattr(faculty, _field, getattr(data, _field))

        await session.commit()
        await session.refresh(faculty)
        return faculty

    @staticmethod
    async def _ensure_dekan_free(
        session: AsyncSession, employee_id: int | None, exclude_faculty_id: int | None = None
    ) -> None:
        """Один человек — один деканат.

        В базе это гарантирует UNIQUE, но её ошибка приходит наверх невнятным
        «conflicts with an existing record». Проверяем заранее, чтобы назвать
        факультет, на котором человек уже числится.
        """
        if employee_id is None:
            return
        stmt = select(Faculty.name).where(Faculty.dekan_employee_id == employee_id)
        if exclude_faculty_id is not None:
            stmt = stmt.where(Faculty.id != exclude_faculty_id)
        taken_by = (await session.execute(stmt)).scalar_one_or_none()
        if taken_by:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Bu xodim allaqachon «{taken_by}» fakultetining dekani",
            )

    @staticmethod
    def _faculty_group_ids_stmt(faculty_id: int):
        """Группы факультета: прямой ссылки больше нет, только через цепочку.

        Раньше у Group был свой faculty_id, и такой запрос был одним WHERE.
        Столбец убрали — он расходился с этой самой цепочкой, — так что путь
        теперь ровно один.
        """
        from app.modules.organization_structure.group.model import Group
        from app.modules.organization_structure.kafedra.model import Kafedra
        from app.modules.organization_structure.speciality.model import Speciality

        return (
            select(Group.id)
            .join(Speciality, Speciality.id == Group.speciality_id)
            .join(Kafedra, Kafedra.id == Speciality.kafedra_id)
            .where(Kafedra.faculty_id == faculty_id)
        )

    async def delete_faculty(self, session: AsyncSession, faculty_id: int, force: bool = False) -> None:
        from sqlalchemy import delete, func, select

        from app.modules.organization_structure.group.model import Group
        from app.modules.organization_structure.kafedra.model import Kafedra
        from app.modules.organization_structure.speciality.model import Speciality

        group_ids_stmt = self._faculty_group_ids_stmt(faculty_id)

        if not force:
            kafedra_count = (
                await session.execute(select(func.count(Kafedra.id)).where(Kafedra.faculty_id == faculty_id))
            ).scalar() or 0
            group_count = (
                await session.execute(
                    select(func.count()).select_from(group_ids_stmt.subquery())
                )
            ).scalar() or 0

            if kafedra_count > 0 or group_count > 0:
                warnings = []
                if kafedra_count > 0:
                    warnings.append(f"{kafedra_count} ta kafedra va ulardagi barcha o'qituvchilar tizimdan o'chadi")
                if group_count > 0:
                    warnings.append(
                        f"{group_count} ta guruh o'chadi (talabalarning guruhi belgilanmagan holatga o'tadi)"
                    )

                raise HTTPException(
                    status_code=409,
                    detail={
                        "requires_confirmation": True,
                        "message": "Ushbu fakultetni o'chirish quyidagi jiddiy oqibatlarga olib keladi:",
                        "warnings": warnings,
                    },
                )

        # Proceed with forced aggressive cascade delete.
        # Порядок теперь снизу вверх и обязателен: specialities.kafedra_id и
        # groups.speciality_id объявлены RESTRICT, так что удалить кафедру
        # раньше её специальностей, а специальность раньше её групп — нельзя.
        from app.modules.organization_structure.group.model import GroupTeacher

        group_ids = (await session.execute(group_ids_stmt)).scalars().all()
        if group_ids:
            await session.execute(delete(GroupTeacher).where(GroupTeacher.group_id.in_(group_ids)))
            await session.execute(delete(Group).where(Group.id.in_(group_ids)))

        kafedra_ids = (
            (await session.execute(select(Kafedra.id).where(Kafedra.faculty_id == faculty_id))).scalars().all()
        )
        if kafedra_ids:
            from app.modules.auth.teacher.model import Teacher

            # curriculum висит на specialities с CASCADE — отдельно не чистим.
            await session.execute(delete(Speciality).where(Speciality.kafedra_id.in_(kafedra_ids)))

            teacher_ids = (
                (await session.execute(select(Teacher.id).where(Teacher.kafedra_id.in_(kafedra_ids)))).scalars().all()
            )
            if teacher_ids:
                from app.modules.quiz.subject.model import SubjectTeacher

                await session.execute(delete(SubjectTeacher).where(SubjectTeacher.teacher_id.in_(teacher_ids)))
                await session.execute(delete(GroupTeacher).where(GroupTeacher.teacher_id.in_(teacher_ids)))
                await session.execute(delete(Teacher).where(Teacher.id.in_(teacher_ids)))
            await session.execute(delete(Kafedra).where(Kafedra.faculty_id == faculty_id))

        stmt = select(Faculty).where(Faculty.id == faculty_id)
        result = await session.execute(stmt)
        faculty = result.scalar_one_or_none()

        if not faculty:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Faculty not found")

        await session.delete(faculty)
        await session.commit()

    async def find_by_name(self, session: AsyncSession, name: str) -> Faculty | None:
        """Ищет факультет по каноническому имени, не создавая его.

        Раньше здесь был get_or_create, и вход студента из HEMIS заводил
        недостающий факультет сам. Стоило HEMIS переименовать факультет —
        появлялся второй, и студенты молча делились между старым и новым.
        Теперь несовпадение — это видимая ошибка входа, а не тихий раскол.
        """
        if not name or not name.strip():
            return None
        stmt = select(Faculty).where(Faculty.name == normalized_name(name))
        return (await session.execute(stmt)).scalars().first()

    async def find_id_by_name(self, session: AsyncSession, name: str) -> int | None:
        stmt = select(Faculty.id).where(Faculty.name == normalized_name(name))
        return (await session.execute(stmt)).scalar_one_or_none()


get_faculty_repository = FacultyRepository()
