"""Чтение и запись зеркала оргструктуры.

Правила, общие для всех методов этого модуля:

* строки, заведённые вручную (``external_source IS NULL``), синхронизация не
  трогает, пока администратор явно не свяжет их с внешней сущностью;
* ничего не удаляется — исчезнувшее в EduPlan помечается ``is_active = False``,
  потому что на факультетах, группах и предметах висят результаты тестов;
* сопоставление по имени всегда идёт по нормализованной форме, но записывается
  имя ровно в том виде, в каком его отдал EduPlan.
"""

import logging
import re
import secrets

from core.mixins.external_ref import SOURCE_EDUPLAN
from core.mixins.time_stamp_mixin import utcnow_naive
from core.utils.password_hash import hash_password_async
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.auth.model import Role, Teacher, User
from app.modules.organization_structure.model import (
    Faculty,
    Group,
    Kafedra,
    Speciality,
)
from app.modules.quiz.model import Subject

logger = logging.getLogger(__name__)


def normalize_name(value: str | None) -> str:
    """Форма имени для сравнения: без регистра, без лишних пробелов."""
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip().lower()


class EduPlanRepository:
    # ------------------------------------------------------------------ #
    #  Чтение
    # ------------------------------------------------------------------ #
    async def load_all(self, session: AsyncSession, model) -> list:
        return list((await session.execute(select(model))).scalars().all())

    async def index_by_external(self, session: AsyncSession, model) -> dict[str, object]:
        """Уже связанные строки: external_id -> объект."""
        stmt = select(model).where(
            model.external_source == SOURCE_EDUPLAN,
            model.external_id.is_not(None),
        )
        rows = (await session.execute(stmt)).scalars().all()
        return {row.external_id: row for row in rows}

    async def load_teachers(self, session: AsyncSession) -> list[Teacher]:
        stmt = select(Teacher).options(selectinload(Teacher.user).selectinload(User.roles))
        return list((await session.execute(stmt)).scalars().all())

    async def username_exists(self, session: AsyncSession, username: str) -> bool:
        stmt = select(func.count()).select_from(User).where(User.username == username)
        return bool((await session.execute(stmt)).scalar() or 0)

    # ------------------------------------------------------------------ #
    #  Запись справочников
    # ------------------------------------------------------------------ #
    @staticmethod
    def _stamp(row, external_id: str) -> None:
        row.external_id = external_id
        row.external_source = SOURCE_EDUPLAN
        row.synced_at = utcnow_naive()
        row.is_active = True

    async def upsert_faculty(
        self, session: AsyncSession, external_id: str, name: str, existing: Faculty | None
    ) -> Faculty:
        row = existing or Faculty(name=name)
        row.name = name
        self._stamp(row, external_id)
        session.add(row)
        await session.flush()
        return row

    async def upsert_kafedra(
        self,
        session: AsyncSession,
        external_id: str,
        name: str,
        faculty_id: int,
        existing: Kafedra | None,
    ) -> Kafedra:
        row = existing or Kafedra(name=name, faculty_id=faculty_id)
        row.name = name
        row.faculty_id = faculty_id
        self._stamp(row, external_id)
        session.add(row)
        await session.flush()
        return row

    async def upsert_speciality(
        self,
        session: AsyncSession,
        external_id: str,
        name: str,
        kafedra_id: int,
        education_type: str | None,
        existing: Speciality | None,
    ) -> Speciality:
        row = existing or Speciality(name=name, kafedra_id=kafedra_id)
        row.name = name
        row.kafedra_id = kafedra_id
        row.education_type = education_type
        self._stamp(row, external_id)
        session.add(row)
        await session.flush()
        return row

    async def upsert_group(
        self,
        session: AsyncSession,
        external_id: str,
        name: str,
        faculty_id: int,
        speciality_id: int | None,
        course: int | None,
        education_shape: str | None,
        student_count: int | None,
        existing: Group | None,
    ) -> Group:
        row = existing or Group(name=name, faculty_id=faculty_id)
        row.name = name
        row.faculty_id = faculty_id
        row.speciality_id = speciality_id
        row.course = course
        row.education_shape = education_shape
        row.student_count = student_count
        self._stamp(row, external_id)
        session.add(row)
        await session.flush()
        return row

    async def upsert_subject(
        self,
        session: AsyncSession,
        external_id: str,
        name: str,
        kafedra_id: int | None,
        existing: Subject | None,
    ) -> Subject:
        row = existing or Subject(name=name)
        row.name = name
        row.kafedra_id = kafedra_id
        self._stamp(row, external_id)
        session.add(row)
        await session.flush()
        return row

    # ------------------------------------------------------------------ #
    #  Сотрудники
    # ------------------------------------------------------------------ #
    async def _unique_username(self, session: AsyncSession, preferred: str, fallback: str) -> str:
        """Свободное имя учётной записи.

        Логины сотрудников EduPlan и студентов HEMIS живут в разных
        пространствах и вполне могут совпасть, а ``users.username`` уникален.
        При столкновении уходим на hemis_id, затем на числовой суффикс.
        """
        for candidate in (preferred, fallback):
            if candidate and not await self.username_exists(session, candidate):
                return candidate
        base = preferred or fallback or "eduplan_user"
        for suffix in range(2, 100):
            candidate = f"{base}_{suffix}"
            if not await self.username_exists(session, candidate):
                return candidate
        return f"{base}_{secrets.token_hex(4)}"

    async def _ensure_role(self, session: AsyncSession, user: User, role_name: str) -> None:
        if any(r.name.lower() == role_name for r in user.roles):
            return
        role = (await session.execute(select(Role).where(func.lower(Role.name) == role_name))).scalar_one_or_none()
        if role is None:
            logger.warning("Роль %r отсутствует, пользователю %s не назначена", role_name, user.username)
            return
        user.roles.append(role)

    async def upsert_teacher(
        self,
        session: AsyncSession,
        external_id: str,
        username: str,
        hemis_id: str | None,
        first_name: str,
        last_name: str,
        third_name: str,
        full_name: str,
        kafedra_id: int | None,
        existing: Teacher | None,
    ) -> Teacher:
        row = existing
        if row is None:
            # Локальная учётная запись обязательна: teachers.user_id NOT NULL.
            # Пароль — случайный и никому не известный: такой пользователь
            # входит только через внешнюю аутентификацию.
            login = await self._unique_username(session, username, hemis_id or "")
            user = User(username=login, password=await hash_password_async(secrets.token_urlsafe(32)))
            session.add(user)
            await session.flush()
            await session.refresh(user, attribute_names=["roles"])
            row = Teacher(
                user_id=user.id,
                first_name=first_name,
                last_name=last_name,
                third_name=third_name,
                full_name=full_name,
            )
        else:
            # Не `row.user`: на боевом пути (`EduPlanSyncService.apply`) строка
            # приезжает из голого `session.get` в свежей сессии, связь не
            # подгружена, и ленивая загрузка в async-сессии падает
            # `MissingGreenlet` — молча, потому что `_apply_one` пишет это в
            # `result.errors`. Отдельный запрос с `selectinload(User.roles)`:
            # `roles` — единственное, что читает и меняет `_ensure_role`, а
            # через `select`, а не `session.get`, потому что `get` вернул бы
            # объект из identity map, не применив loader options.
            user = (
                await session.execute(select(User).where(User.id == row.user_id).options(selectinload(User.roles)))
            ).scalar_one_or_none()

        row.first_name = first_name
        row.last_name = last_name
        row.third_name = third_name
        row.full_name = full_name
        row.hemis_id = hemis_id
        row.kafedra_id = kafedra_id
        self._stamp(row, external_id)
        session.add(row)
        await session.flush()

        # Роль назначаем только базовую. admin/psixologik/tutor выдаёт
        # администратор вручную: кадровая ошибка во внешней системе не
        # должна превращаться в расширение прав у нас.
        if user is not None:
            await self._ensure_role(session, user, "teacher")

        return row

    # ------------------------------------------------------------------ #
    #  Деактивация
    # ------------------------------------------------------------------ #
    async def deactivate(self, session: AsyncSession, row) -> None:
        """Пропавшее в EduPlan не удаляем: на нём висят результаты и вопросы."""
        row.is_active = False
        row.synced_at = utcnow_naive()
        session.add(row)


eduplan_repository = EduPlanRepository()
