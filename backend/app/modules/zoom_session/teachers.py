"""Seans o'qituvchisi va fani: kim, qaysi fanlari bilan (`teacher_subject` ∪ yuklama)."""


from sqlalchemy import select, union
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.course.lesson_access import is_admin
from app.modules.auth.model import Teacher, TeacherAssignment, TeacherSubject, User
from app.modules.quiz.model import Subject

from .accounts import (
    ENV_ACCOUNT_ID,
    all_credentials,
)
from .schemas import (
    ZoomAccountOption,
    ZoomCapabilitiesResponse,
    ZoomSubjectOption,
    ZoomSubjectOptionListResponse,
    ZoomTeacherOption,
    ZoomTeacherOptionListResponse,
)
from .errors import _teacher_required, _teacher_not_found, _teacher_locked
from .naming import _readable_name


class ZoomTeachersMixin:
    # ── O'qituvchi va fan ────────────────────────────────────────────────────

    @staticmethod
    async def _teacher_by_user(session: AsyncSession, user_id: int) -> Teacher | None:
        return (
            await session.execute(
                select(Teacher).options(selectinload(Teacher.kafedra)).where(Teacher.user_id == user_id)
            )
        ).scalar_one_or_none()

    async def _own_teacher(self, session: AsyncSession, user: User) -> Teacher | None:
        """Admin bo'lmagan o'qituvchi faqat o'zi uchun seans tuzadi."""
        return None if is_admin(user) else await self._teacher_by_user(session, user.id)

    async def _resolve_teacher(self, session: AsyncSession, user: User, teacher_user_id: int | None) -> Teacher:
        own = await self._own_teacher(session, user)
        if own is not None:
            if teacher_user_id not in (None, own.user_id):
                raise _teacher_locked()
            return own
        if teacher_user_id is None:
            raise _teacher_required()
        teacher = await self._teacher_by_user(session, teacher_user_id)
        if teacher is None:
            raise _teacher_not_found()
        return teacher

    @staticmethod
    async def _teacher_subject_ids(session: AsyncSession, teacher_id: int) -> set[int]:
        """O'qituvchining fanlari: `teacher_subject` va EPOS yuklamasi birgalikda.

        Ikkalasi ham kerak: yuklama hammani qamramaydi, `teacher_subject` esa
        yuklamada bor ba'zi fanlarni bilmaydi.
        """
        linked = select(TeacherSubject.subject_id).where(
            TeacherSubject.teacher_id == teacher_id, TeacherSubject.is_active.is_(True)
        )
        assigned = select(TeacherAssignment.subject_id).where(
            TeacherAssignment.teacher_id == teacher_id, TeacherAssignment.is_active.is_(True)
        )
        return set((await session.execute(union(linked, assigned))).scalars().all())

    @staticmethod
    def _teacher_option(teacher: Teacher) -> ZoomTeacherOption:
        return ZoomTeacherOption(
            user_id=teacher.user_id,
            name=_readable_name(teacher.full_name),
            kafedra_name=teacher.kafedra.name if teacher.kafedra else None,
        )

    async def teacher_options(
        self, session: AsyncSession, user: User, search: str | None, limit: int
    ) -> ZoomTeacherOptionListResponse:
        own = await self._own_teacher(session, user)
        if own is not None:
            return ZoomTeacherOptionListResponse(teachers=[self._teacher_option(own)], locked=True)
        stmt = (
            select(Teacher)
            .options(selectinload(Teacher.kafedra))
            .join(User, User.id == Teacher.user_id)
            .where(User.is_active.is_(True), Teacher.is_active.is_(True))
        )
        if search and search.strip():
            stmt = stmt.where(Teacher.full_name.ilike(f"%{search.strip()}%"))
        rows = (await session.execute(stmt.order_by(Teacher.full_name).limit(limit))).scalars().all()
        return ZoomTeacherOptionListResponse(teachers=[self._teacher_option(t) for t in rows])

    async def teacher_subjects(
        self, session: AsyncSession, user: User, teacher_user_id: int
    ) -> ZoomSubjectOptionListResponse:
        teacher = await self._resolve_teacher(session, user, teacher_user_id)
        ids = await self._teacher_subject_ids(session, teacher.id)
        if not ids:
            return ZoomSubjectOptionListResponse(subjects=[])
        rows = (
            await session.execute(select(Subject.id, Subject.name).where(Subject.id.in_(ids)).order_by(Subject.name))
        ).all()
        return ZoomSubjectOptionListResponse(subjects=[ZoomSubjectOption(id=i, name=n) for i, n in rows])

    # ── Akkaunt tanlash ──────────────────────────────────────────────────────

    async def capabilities(self, session: AsyncSession) -> ZoomCapabilitiesResponse:
        accounts = [a for a in await all_credentials(session) if a.sdk_enabled or a.api_enabled]
        options = [
            ZoomAccountOption(id=a.id or ENV_ACCOUNT_ID, name=a.name, auto_create=a.api_enabled and a.sdk_enabled)
            for a in accounts
        ]
        return ZoomCapabilitiesResponse(auto_create=any(o.auto_create for o in options), accounts=options)
