import logging
import re

from fastapi import HTTPException, status
from sqlalchemy import desc, func, or_, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import User
from app.modules.organization_structure.model import Group, GroupTeacher
from app.modules.quiz.model import Result

from .schemas import (
    GroupCreateRequest,
    GroupListRequest,
    GroupListResponse,
)

logger = logging.getLogger(__name__)


class GroupRepository:
    async def create_group(self, session: AsyncSession, data: GroupCreateRequest) -> Group:
        stmt_check = select(Group).where(Group.name == data.name)
        result_check = await session.execute(stmt_check)
        if result_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Group '{data.name}' already exists",
            )

        # position со server_default '0' поставил бы новую запись в начало
        # списка. Новая запись должна оказаться в конце — её место потом
        # меняют перетаскиванием, а не тем, что она только что создана.
        next_position = (
            await session.execute(
                select(func.coalesce(func.max(Group.position), 0) + 1).where(Group.faculty_id == data.faculty_id)
            )
        ).scalar_one()

        new_group = Group(name=data.name, faculty_id=data.faculty_id, position=next_position)
        session.add(new_group)

        try:
            await session.commit()
            await session.refresh(new_group)
        except IntegrityError as e:
            await session.rollback()
            logger.warning("Integrity error creating group %r: %s", data.name, e)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Group '{data.name}' conflicts with an existing record or invalid faculty_id",
            )
        except SQLAlchemyError:
            await session.rollback()
            logger.exception("Database error creating group %r", data.name)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database error",
            )
        return new_group

    async def get_group(self, session: AsyncSession, group_id: int) -> Group:
        stmt = select(Group).where(Group.id == group_id)
        result = await session.execute(stmt)
        group = result.scalar_one_or_none()

        if not group:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

        return group

    async def list_groups(
        self, session: AsyncSession, request: GroupListRequest, current_user: User
    ) -> GroupListResponse:
        stmt = select(Group)

        is_admin = any(role.name.lower() == "admin" for role in current_user.roles)
        is_teacher = any(role.name.lower() == "teacher" for role in current_user.roles)
        is_student = any(role.name.lower() == "student" for role in current_user.roles)

        # Track if we already joined GroupTeacher to avoid duplicate JOINs
        already_joined_group_teacher = False
        assigned_group_id = None

        if is_admin:
            # Admins see ALL groups — no filter applied, ignore request.teacher_id
            pass
        elif is_teacher:
            stmt = stmt.join(GroupTeacher, Group.id == GroupTeacher.group_id).where(
                GroupTeacher.teacher_id == current_user.id
            )
            already_joined_group_teacher = True
        elif is_student:
            from app.modules.auth.model import Student

            student_stmt = select(Student.group_id).where(Student.user_id == current_user.id)
            student_result = await session.execute(student_stmt)
            assigned_group_id = student_result.scalar_one_or_none()
            if assigned_group_id:
                stmt = stmt.where(Group.id == assigned_group_id)
            else:
                stmt = stmt.where(Group.id == -1)

        # Only apply explicit teacher_id filter for non-admin users
        # and only if it wasn't already joined via role-based filter
        if not is_admin and request.teacher_id and not already_joined_group_teacher:
            stmt = stmt.join(GroupTeacher, Group.id == GroupTeacher.group_id).where(
                GroupTeacher.teacher_id == request.teacher_id
            )

        if request.name:
            stmt = stmt.where(Group.name.ilike(f"%{request.name}%"))

        if request.faculty_id:
            stmt = stmt.where(Group.faculty_id == request.faculty_id)

        # Порядок задаётся вручную (position), а не датой создания:
        # структуру университета читают сверху вниз, а не «сначала свежее».
        stmt = stmt.order_by(Group.position, Group.id)
        stmt = stmt.offset(request.offset).limit(request.limit)

        result = await session.execute(stmt)
        groups = result.scalars().all()

        # --- Count query ---
        count_stmt = select(func.count()).select_from(Group)

        if is_admin:
            pass
        elif is_teacher:
            count_stmt = count_stmt.join(GroupTeacher, Group.id == GroupTeacher.group_id).where(
                GroupTeacher.teacher_id == current_user.id
            )
        elif is_student:
            if assigned_group_id:
                count_stmt = count_stmt.where(Group.id == assigned_group_id)
            else:
                count_stmt = count_stmt.where(Group.id == -1)

        if not is_admin and request.teacher_id and not already_joined_group_teacher:
            count_stmt = count_stmt.join(GroupTeacher, Group.id == GroupTeacher.group_id).where(
                GroupTeacher.teacher_id == request.teacher_id
            )
        if request.name:
            count_stmt = count_stmt.where(Group.name.ilike(f"%{request.name}%"))
        if request.faculty_id:
            count_stmt = count_stmt.where(Group.faculty_id == request.faculty_id)

        total_result = await session.execute(count_stmt)
        total = total_result.scalar() or 0

        return GroupListResponse(total=total, page=request.page, limit=request.limit, groups=groups)

    async def update_group(self, session: AsyncSession, group_id: int, data: GroupCreateRequest) -> Group:
        stmt = select(Group).where(Group.id == group_id)
        result = await session.execute(stmt)
        group = result.scalar_one_or_none()

        if not group:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

        if data.name is not None:
            # Check unique name excluding current
            stmt_check = select(Group).where(Group.name == data.name, Group.id != group_id)
            existing = (await session.execute(stmt_check)).scalar_one_or_none()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Group name already taken",
                )
            group.name = data.name

        if data.faculty_id is not None:
            group.faculty_id = data.faculty_id

        await session.commit()
        await session.refresh(group)
        return group

    async def delete_group(self, session: AsyncSession, group_id: int, force: bool = False) -> None:
        from app.modules.auth.model import Student
        from app.modules.organization_structure.model import GroupTeacher
        from app.modules.quiz.model import Quiz

        stmt = select(Group).where(Group.id == group_id)
        result = await session.execute(stmt)
        group = result.scalar_one_or_none()

        if not group:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

        if not force:
            student_count = (
                await session.execute(select(func.count(Student.id)).where(Student.group_id == group_id))
            ).scalar() or 0
            result_count = (
                await session.execute(select(func.count(Result.id)).where(Result.group_id == group_id))
            ).scalar() or 0
            quiz_count = (
                await session.execute(select(func.count(Quiz.id)).where(Quiz.group_id == group_id))
            ).scalar() or 0
            teacher_count = (
                await session.execute(select(func.count(GroupTeacher.id)).where(GroupTeacher.group_id == group_id))
            ).scalar() or 0

            total = student_count + result_count + quiz_count + teacher_count
            if total > 0:
                warnings = []
                if student_count > 0:
                    warnings.append(f"{student_count} ta talaba guruhsiz qoladi")
                if result_count > 0:
                    warnings.append(f"{result_count} ta test natijalari guruhsiz qoladi")
                if quiz_count > 0:
                    warnings.append(f"{quiz_count} ta guruhga oid testlar guruhsiz qoladi")
                if teacher_count > 0:
                    warnings.append(f"{teacher_count} ta o'qituvchi guruhdan uziladi")

                raise HTTPException(
                    status_code=409,
                    detail={
                        "requires_confirmation": True,
                        "message": "Ushbu guruhni o'chirish quyidagi bog'langan ma'lumotlarga ta'sir qiladi:",
                        "warnings": warnings,
                    },
                )

        # FK ondelete="SET NULL" on Student.group_id and Result.group_id means
        # linked students/results lose their group reference but are NOT deleted.
        # GroupTeacher has cascade delete orphan.
        await session.delete(group)
        await session.commit()

    @staticmethod
    def _normalize_name(name: str) -> tuple[str, str]:
        clean = name.lower().strip()
        normalized = re.sub(r"(\d)([a-z])", r"\1 \2", clean)
        normalized = re.sub(r"(\d+)([a-z]{2})$", r"\1 \2", normalized)
        return clean, normalized

    async def get_or_create(self, session: AsyncSession, name: str, faculty_id: int) -> Group:
        clean, normalized = self._normalize_name(name)
        stmt = select(Group).where(
            or_(
                Group.name == normalized,
                Group.name == clean,
                Group.name.ilike(f"%{clean.replace(' ', '')}%"),
            )
        )
        obj = (await session.execute(stmt)).scalar_one_or_none()
        if not obj:
            try:
                obj = Group(name=normalized, faculty_id=faculty_id)
                session.add(obj)
                await session.flush()
                await session.refresh(obj)
            except IntegrityError:
                await session.rollback()
                obj = (await session.execute(select(Group).where(Group.name == normalized))).scalar_one()
        return obj

    async def find_id_by_name_fuzzy(self, session: AsyncSession, name: str) -> tuple[int | None, str]:
        clean, normalized = self._normalize_name(name)
        stmt = select(Group.id).where(
            or_(
                Group.name == normalized,
                Group.name == clean,
                Group.name.ilike(f"%{clean.replace(' ', '')}%"),
            )
        )
        group_id = (await session.execute(stmt)).scalars().first()
        suggested = normalized if not group_id else name
        return group_id, suggested


get_group_repository = GroupRepository()
