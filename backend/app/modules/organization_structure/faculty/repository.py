import logging

from core.utils.external_guard import ensure_editable
from core.utils.lesson_guard import ensure_no_lessons
from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.organization_structure.model import Faculty

from .schemas import (
    FacultyCreateRequest,
    FacultyListRequest,
    FacultyListResponse,
    FacultyStatsItem,
    FacultyStatsResponse,
)

logger = logging.getLogger(__name__)


class FacultyRepository:
    async def create_faculty(self, session: AsyncSession, data: FacultyCreateRequest) -> Faculty:
        stmt_check = select(Faculty).where(Faculty.name == data.name)
        result_check = await session.execute(stmt_check)
        if result_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Faculty '{data.name}' already exists",
            )

        new_faculty = Faculty(name=data.name)
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

        stmt = stmt.order_by(desc(Faculty.created_at))
        stmt = stmt.offset(request.offset).limit(request.limit)

        result = await session.execute(stmt)
        faculties = result.scalars().all()

        count_stmt = select(func.count()).select_from(Faculty)
        if request.name:
            count_stmt = count_stmt.where(Faculty.name.ilike(f"%{request.name}%"))

        total_result = await session.execute(count_stmt)
        total = total_result.scalar() or 0

        return FacultyListResponse(total=total, page=request.page, limit=request.limit, faculties=faculties)

    async def update_faculty(self, session: AsyncSession, faculty_id: int, data: FacultyCreateRequest) -> Faculty:
        stmt = select(Faculty).where(Faculty.id == faculty_id)
        result = await session.execute(stmt)
        faculty = result.scalar_one_or_none()

        if not faculty:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Faculty not found")

        ensure_editable(faculty, "факультета")

        if data.name is not None:
            stmt_check = select(Faculty).where(Faculty.name == data.name, Faculty.id != faculty_id)
            existing_faculty = (await session.execute(stmt_check)).scalar_one_or_none()
            if existing_faculty:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Faculty name already taken",
                )
            faculty.name = data.name

        await session.commit()
        await session.refresh(faculty)
        return faculty

    async def delete_faculty(self, session: AsyncSession, faculty_id: int, force: bool = False) -> None:
        from sqlalchemy import delete, func, select

        from app.modules.organization_structure.model import Group, Kafedra

        ensure_editable(await self.get_faculty(session, faculty_id), "факультета")

        if not force:
            kafedra_count = (
                await session.execute(select(func.count(Kafedra.id)).where(Kafedra.faculty_id == faculty_id))
            ).scalar() or 0
            group_count = (
                await session.execute(select(func.count(Group.id)).where(Group.faculty_id == faculty_id))
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

        # Proceed with forced aggressive cascade delete

        # 1. Cascade delete Kafedras and their Teachers
        kafedra_ids = (
            (await session.execute(select(Kafedra.id).where(Kafedra.faculty_id == faculty_id))).scalars().all()
        )
        if kafedra_ids:
            from app.modules.auth.model import Teacher

            teacher_ids = (
                (await session.execute(select(Teacher.id).where(Teacher.kafedra_id.in_(kafedra_ids)))).scalars().all()
            )
            if teacher_ids:
                from app.modules.auth.model import TeacherSubject
                from app.modules.organization_structure.model import TeacherGroup

                ts_of_faculty = TeacherSubject.teacher_id.in_(teacher_ids)
                await ensure_no_lessons(session, "Bu fakultet o'qituvchilari", ts_of_faculty)
                await session.execute(delete(TeacherSubject).where(TeacherSubject.teacher_id.in_(teacher_ids)))
                await session.execute(delete(TeacherGroup).where(TeacherGroup.teacher_id.in_(teacher_ids)))
                await session.execute(delete(Teacher).where(Teacher.id.in_(teacher_ids)))
            await session.execute(delete(Kafedra).where(Kafedra.faculty_id == faculty_id))

        # 2. Cascade delete Groups
        group_ids = (await session.execute(select(Group.id).where(Group.faculty_id == faculty_id))).scalars().all()
        if group_ids:
            from app.modules.organization_structure.model import TeacherGroup

            await session.execute(delete(TeacherGroup).where(TeacherGroup.group_id.in_(group_ids)))
            await session.execute(delete(Group).where(Group.faculty_id == faculty_id))

        stmt = select(Faculty).where(Faculty.id == faculty_id)
        result = await session.execute(stmt)
        faculty = result.scalar_one_or_none()

        if not faculty:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Faculty not found")

        await session.delete(faculty)
        await session.commit()

    async def get_faculty_stats(self, session: AsyncSession) -> FacultyStatsResponse:
        """Счётчики по каждому факультету для карточек справочника.

        Студенты считаются через группу: у групп есть прямой faculty_id,
        а у студентов — group_id (студенты без группы не попадают в счёт).
        """
        from app.modules.auth.model import Student
        from app.modules.organization_structure.model import Group, Kafedra, Speciality

        kafedra_rows = (
            await session.execute(select(Kafedra.faculty_id, func.count(Kafedra.id)).group_by(Kafedra.faculty_id))
        ).all()
        speciality_rows = (
            await session.execute(
                select(Kafedra.faculty_id, func.count(Speciality.id))
                .join(Kafedra, Speciality.kafedra_id == Kafedra.id)
                .group_by(Kafedra.faculty_id)
            )
        ).all()
        student_rows = (
            await session.execute(
                select(Group.faculty_id, func.count(Student.id))
                .join(Group, Student.group_id == Group.id)
                .group_by(Group.faculty_id)
            )
        ).all()

        kafedras = dict(kafedra_rows)
        specialities = dict(speciality_rows)
        students = dict(student_rows)

        faculty_ids = (await session.execute(select(Faculty.id))).scalars().all()
        return FacultyStatsResponse(
            stats=[
                FacultyStatsItem(
                    faculty_id=fid,
                    kafedra_count=kafedras.get(fid, 0),
                    speciality_count=specialities.get(fid, 0),
                    student_count=students.get(fid, 0),
                )
                for fid in faculty_ids
            ]
        )

    async def get_or_create(self, session: AsyncSession, name: str) -> Faculty:
        stmt = select(Faculty).where(Faculty.name == name)
        obj = (await session.execute(stmt)).scalar_one_or_none()
        if not obj:
            obj = Faculty(name=name)
            session.add(obj)
            await session.flush()
            await session.refresh(obj)
        return obj

    async def find_id_by_name(self, session: AsyncSession, name: str) -> int | None:
        stmt = select(Faculty.id).where(Faculty.name == name)
        return (await session.execute(stmt)).scalar_one_or_none()


get_faculty_repository = FacultyRepository()
