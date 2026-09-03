import logging
import re

from core.utils.external_guard import ensure_editable
from fastapi import HTTPException, status
from sqlalchemy import case, desc, func, or_, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.utils.visibility import apply_visibility
from app.modules.auth.model import Teacher, User
from app.modules.course.model import Course, CourseGroup, CourseTeacher
from app.modules.organization_structure.model import Group, TeacherGroup
from app.modules.quiz.model import Result

from .schemas import (
    GroupCreateRequest,
    GroupListRequest,
    GroupListResponse,
)

logger = logging.getLogger(__name__)


class GroupRepository:
    async def is_group_assigned_to_user(self, session: AsyncSession, user: User, group_id: int) -> bool:
        """Guruh shu o'qituvchiniki-mi.

        Ikki manba `list_teacher_students` dagi bilan bir xil: `teacher_group`
        va o'qituvchining kurslariga biriktirilgan guruhlar. Ro'yxat ham shu
        qoida bo'yicha cheklangan, shuning uchun ochib bo'lmaydigan qator
        ko'rinmasligi kerak.
        """
        teacher_ids = select(Teacher.id).where(Teacher.user_id == user.id)
        assigned = await session.execute(
            select(TeacherGroup.id)
            .where(TeacherGroup.group_id == group_id, TeacherGroup.teacher_id.in_(teacher_ids))
            .limit(1)
        )
        if assigned.scalars().first() is not None:
            return True

        course_ids = (
            select(Course.id.label("course_id"))
            .where(Course.teacher_id == user.id)
            .union(select(CourseTeacher.course_id.label("course_id")).where(CourseTeacher.user_id == user.id))
            .subquery()
        )
        via_course = await session.execute(
            select(CourseGroup.id)
            .where(
                CourseGroup.group_id == group_id,
                CourseGroup.course_id.in_(select(course_ids.c.course_id)),
            )
            .limit(1)
        )
        return via_course.scalars().first() is not None

    async def create_group(self, session: AsyncSession, data: GroupCreateRequest) -> Group:
        stmt_check = select(Group).where(Group.name == data.name)
        result_check = await session.execute(stmt_check)
        if result_check.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Group '{data.name}' already exists",
            )

        new_group = Group(name=data.name, faculty_id=data.faculty_id)
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
        # faculty подгружается сразу: у группы его спрашивают почти всегда, а
        # ленивая загрузка в асинхронной сессии обернулась бы MissingGreenlet.
        stmt = select(Group).options(selectinload(Group.faculty)).where(Group.id == group_id)
        result = await session.execute(stmt)
        group = result.scalar_one_or_none()

        if not group:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

        return group

    async def list_groups(
        self, session: AsyncSession, request: GroupListRequest, current_user: User
    ) -> GroupListResponse:
        stmt = select(Group)
        stmt = apply_visibility(stmt, Group, current_user, request.include_hidden)

        is_admin = any(role.name.lower() == "admin" for role in current_user.roles)
        is_teacher = any(role.name.lower() == "teacher" for role in current_user.roles)
        is_student = any(role.name.lower() == "student" for role in current_user.roles)

        # Track if we already joined TeacherGroup to avoid duplicate JOINs
        already_joined_group_teacher = False
        assigned_group_id = None

        if is_admin:
            # Admins see ALL groups — no filter applied, ignore request.teacher_id
            pass
        elif is_teacher:
            stmt = stmt.join(TeacherGroup, Group.id == TeacherGroup.group_id).where(
                TeacherGroup.teacher_id.in_(select(Teacher.id).where(Teacher.user_id == current_user.id))
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
        # and only if it wasn't already joined via role-based filter.
        # `request.teacher_id` ataylab `users.id` bo'lib qoladi — shartnoma
        # o'zgarmasin, shuning uchun `Teacher` orqali sakraymiz.
        if not is_admin and request.teacher_id and not already_joined_group_teacher:
            stmt = stmt.join(TeacherGroup, Group.id == TeacherGroup.group_id).where(
                TeacherGroup.teacher_id.in_(select(Teacher.id).where(Teacher.user_id == request.teacher_id))
            )

        if request.name:
            stmt = stmt.where(Group.name.ilike(f"%{request.name}%"))

        if request.faculty_id:
            stmt = stmt.where(Group.faculty_id == request.faculty_id)

        if request.speciality_id:
            stmt = stmt.where(Group.speciality_id == request.speciality_id)

        stmt = stmt.order_by(desc(Group.created_at))
        stmt = stmt.offset(request.offset).limit(request.limit)

        result = await session.execute(stmt)
        groups = result.scalars().all()

        # --- Count query ---
        count_stmt = select(func.count()).select_from(Group)
        count_stmt = apply_visibility(count_stmt, Group, current_user, request.include_hidden)

        if is_admin:
            pass
        elif is_teacher:
            count_stmt = count_stmt.join(TeacherGroup, Group.id == TeacherGroup.group_id).where(
                TeacherGroup.teacher_id.in_(select(Teacher.id).where(Teacher.user_id == current_user.id))
            )
        elif is_student:
            if assigned_group_id:
                count_stmt = count_stmt.where(Group.id == assigned_group_id)
            else:
                count_stmt = count_stmt.where(Group.id == -1)

        if not is_admin and request.teacher_id and not already_joined_group_teacher:
            count_stmt = count_stmt.join(TeacherGroup, Group.id == TeacherGroup.group_id).where(
                TeacherGroup.teacher_id.in_(select(Teacher.id).where(Teacher.user_id == request.teacher_id))
            )
        if request.name:
            count_stmt = count_stmt.where(Group.name.ilike(f"%{request.name}%"))
        if request.faculty_id:
            count_stmt = count_stmt.where(Group.faculty_id == request.faculty_id)
        if request.speciality_id:
            count_stmt = count_stmt.where(Group.speciality_id == request.speciality_id)

        total_result = await session.execute(count_stmt)
        total = total_result.scalar() or 0

        return GroupListResponse(total=total, page=request.page, limit=request.limit, groups=groups)

    async def update_group(self, session: AsyncSession, group_id: int, data: GroupCreateRequest) -> Group:
        stmt = select(Group).where(Group.id == group_id)
        result = await session.execute(stmt)
        group = result.scalar_one_or_none()

        if not group:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

        ensure_editable(group, "группы")

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
        from app.modules.course.model import CourseGroup, Lesson
        from app.modules.quiz.model import Quiz

        stmt = select(Group).where(Group.id == group_id)
        result = await session.execute(stmt)
        group = result.scalar_one_or_none()

        if not group:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")

        ensure_editable(group, "группы")

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
                await session.execute(select(func.count(TeacherGroup.id)).where(TeacherGroup.group_id == group_id))
            ).scalar() or 0
            # `lessons.group_id` — ON DELETE CASCADE, в отличие от
            # `lessons.teacher_subject_id` с его RESTRICT. То есть через группу
            # история занятий сносится молча: ни 409 от базы, ни ошибки. Жёсткий
            # запрет здесь ставить нельзя — удаление группы штатная операция, —
            # но оператор обязан увидеть, что именно он уничтожает, до `force`.
            lesson_count = (
                await session.execute(select(func.count(Lesson.id)).where(Lesson.group_id == group_id))
            ).scalar() or 0
            # Guruhsiz darslar (kursning barchasiga tegishli) guruh bilan
            # o'chmaydi — lekin bu guruh kursning oxirgisi bo'lsa, ular
            # hech kimga ko'rinmaydigan bo'lib qoladi.
            stranded_count = (
                await session.execute(
                    select(func.count(Lesson.id))
                    .where(Lesson.group_id.is_(None))
                    .where(
                        Lesson.course_id.in_(
                            select(CourseGroup.course_id)
                            .where(CourseGroup.group_id == group_id)
                            .group_by(CourseGroup.course_id)
                        )
                    )
                    .where(
                        Lesson.course_id.in_(
                            select(CourseGroup.course_id)
                            .group_by(CourseGroup.course_id)
                            .having(func.count(CourseGroup.group_id) == 1)
                        )
                    )
                )
            ).scalar() or 0

            total = student_count + result_count + quiz_count + teacher_count + lesson_count + stranded_count
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
                if lesson_count > 0:
                    warnings.append(f"{lesson_count} ta o'tilgan dars tarixi butunlay o'chadi (tiklab bo'lmaydi)")
                if stranded_count > 0:
                    warnings.append(f"{stranded_count} ta kurs darsi guruhsiz qoladi va talabalarga ko'rinmaydi")

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
        # TeacherGroup has cascade delete orphan. Lesson.group_id, наоборот,
        # CASCADE: занятия группы уходят вместе с ней — об этом и предупреждает
        # список выше.
        await session.delete(group)
        await session.commit()

    @staticmethod
    def _normalize_name(name: str) -> tuple[str, str]:
        clean = name.lower().strip()
        normalized = re.sub(r"(\d)([a-z])", r"\1 \2", clean)
        normalized = re.sub(r"(\d+)([a-z]{2})$", r"\1 \2", normalized)
        return clean, normalized

    @staticmethod
    def _fuzzy_match_stmt(clean: str, normalized: str):
        """Кандидаты на совпадение по имени, точные — первыми.

        Имя группы больше не уникально глобально (UNIQUE заменён на составной
        по факультету), поэтому запрос обязан быть устойчив к нескольким
        совпадениям. Сортировка выводит точные совпадения вперёд, чтобы
        ``.first()`` не выбрал случайное частичное.
        """
        # lower(), а не сравнение как есть: EPOS отдаёт «33a-25 KEM», а clean и
        # normalized приведены к нижнему регистру, и точная ветка никогда бы не
        # срабатывала — оставалась бы только подстрока, дающая лишние совпадения.
        lowered = func.lower(Group.name)
        return (
            select(Group)
            .where(
                or_(
                    lowered == normalized,
                    lowered == clean,
                    lowered.like(f"%{clean.replace(' ', '')}%"),
                )
            )
            .order_by(
                case((lowered == normalized, 0), (lowered == clean, 1), else_=2),
                Group.id,
            )
        )

    async def find_by_hemis_id(self, session: AsyncSession, hemis_group_id: str) -> Group | None:
        stmt = select(Group).options(selectinload(Group.faculty)).where(Group.hemis_group_id == hemis_group_id)
        return (await session.execute(stmt)).scalar_one_or_none()

    async def resolve_for_hemis(
        self,
        session: AsyncSession,
        hemis_group_id: str | None,
        name: str,
        remember: bool = True,
    ) -> Group | None:
        """Группа студента по данным Hemis. Ничего не создаёт.

        Оргструктура — зеркало EPOS, поэтому группы здесь только находят.
        Сначала по ``hemis_group_id``: это точный ключ, переживающий любое
        переименование. Пока он не проставлен — разовый мост по имени, и при
        однозначном совпадении идентификатор запоминается, чтобы следующий вход
        уже не зависел от названия.

        Неоднозначное совпадение не разрешается вслепую: привязка не к той
        группе увела бы студента в чужие тесты, а результаты — в чужую
        статистику. Такой случай остаётся администратору.
        """
        if hemis_group_id:
            group = await self.find_by_hemis_id(session, hemis_group_id)
            if group:
                return group

        candidates = await self.find_candidates_by_name(session, name)
        if len(candidates) != 1:
            if candidates:
                logger.warning(
                    "Группа Hemis %r (id=%s): несколько кандидатов %s — привязка оставлена администратору",
                    name,
                    hemis_group_id,
                    [c.name for c in candidates],
                )
            return None

        group = candidates[0]
        if remember and hemis_group_id and group.hemis_group_id is None:
            group.hemis_group_id = hemis_group_id
            await session.flush()
            logger.info("Группа %s (id=%s) связана с Hemis id=%s", group.name, group.id, hemis_group_id)
        return group

    async def find_id_by_name_fuzzy(self, session: AsyncSession, name: str) -> tuple[int | None, str]:
        clean, normalized = self._normalize_name(name)
        matches = (await session.execute(self._fuzzy_match_stmt(clean, normalized))).scalars().all()
        group_id = matches[0].id if matches else None
        suggested = normalized if not group_id else name
        return group_id, suggested

    async def find_candidates_by_name(self, session: AsyncSession, name: str) -> list[Group]:
        """Все кандидаты на совпадение — для экрана сопоставления с EPOS.

        В отличие от find_id_by_name_fuzzy отдаёт весь список, чтобы вызывающий
        мог отличить однозначное совпадение от неоднозначного и не привязать
        группу вслепую.
        """
        clean, normalized = self._normalize_name(name)
        stmt = self._fuzzy_match_stmt(clean, normalized).options(selectinload(Group.faculty))
        return list((await session.execute(stmt)).scalars().all())


get_group_repository = GroupRepository()
