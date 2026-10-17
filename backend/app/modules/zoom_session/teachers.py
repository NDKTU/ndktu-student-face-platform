"""Seans o'qituvchisi va fani: kim, qaysi fanlari bilan (`teacher_subject` ∪ yuklama)."""


from datetime import timedelta

from sqlalchemy import func, select, union
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.mixins.time_stamp_mixin import utcnow_naive
from app.modules.course.lesson_access import is_admin
from app.modules.organization_structure.model import Group
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
    ZoomTeacherLoadItem,
    ZoomTeacherLoadResponse,
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

    @staticmethod
    def _current_semester() -> str:
        """EPOS'dagi `semester_type`: avgust–yanvar — «Kuzgi», fevral–iyul — «Bahorgi» (Toshkent bo'yicha)."""
        month = (utcnow_naive() + timedelta(hours=5)).month
        return "Kuzgi" if month >= 8 or month == 1 else "Bahorgi"

    async def teacher_load(self, session: AsyncSession, user: User, teacher_user_id: int) -> ZoomTeacherLoadResponse:
        """O'qituvchining EPOS yuklamasi: qaysi guruhga qaysi fanni, qanday turda o'tadi.

        Formada guruhlar va fanlar shundan tanlanadi — butun universitet
        ro'yxatidan emas. Oxirgi o'quv yili va joriy semestr; joriy semestrda
        yuklama bo'lmasa — o'sha yilning hammasi (bo'sh ro'yxatdan yaxshiroq).
        Juftlik odatda bitta qator (`uq_teacher_subject_group`), turlar ichida;
        baribir kalit bo'yicha yig'iladi — `academic_year_id` bo'sh qatorlar ham bor.
        """
        teacher = await self._resolve_teacher(session, user, teacher_user_id)
        base = (
            select(
                TeacherAssignment.subject_id,
                Subject.name,
                TeacherAssignment.group_id,
                Group.name,
                TeacherAssignment.load_types,
                TeacherAssignment.semester_type,
            )
            .join(Subject, Subject.id == TeacherAssignment.subject_id)
            .join(Group, Group.id == TeacherAssignment.group_id)
            .where(
                TeacherAssignment.teacher_id == teacher.id,
                TeacherAssignment.is_active.is_(True),
                Group.is_active.is_(True),
            )
        )
        latest_year = (
            await session.execute(
                select(func.max(TeacherAssignment.academic_year_id)).where(
                    TeacherAssignment.teacher_id == teacher.id, TeacherAssignment.is_active.is_(True)
                )
            )
        ).scalar_one_or_none()
        if latest_year is not None:
            base = base.where(
                (TeacherAssignment.academic_year_id == latest_year) | TeacherAssignment.academic_year_id.is_(None)
            )
        rows = (await session.execute(base)).all()

        semester: str | None = self._current_semester()
        if any(row[5] == semester for row in rows):
            current = [row for row in rows if row[5] in (None, semester)]
        else:
            # Joriy semestrda yuklama yo'q (yoki semestr ko'rsatilmagan) — yil bo'yicha hammasi.
            semester, current = None, rows

        merged: dict[tuple[int, int], ZoomTeacherLoadItem] = {}
        for subject_id, subject_name, group_id, group_name, load_types, _semester in current:
            item = merged.setdefault(
                (subject_id, group_id),
                ZoomTeacherLoadItem(
                    subject_id=subject_id, subject_name=subject_name, group_id=group_id, group_name=group_name
                ),
            )
            for load_type in load_types or []:
                if load_type not in item.load_types:
                    item.load_types.append(load_type)
        items = sorted(merged.values(), key=lambda item: (item.group_name, item.subject_name))
        for item in items:
            item.load_types.sort()
        return ZoomTeacherLoadResponse(items=items, semester=semester)

    # ── Akkaunt tanlash ──────────────────────────────────────────────────────

    async def capabilities(self, session: AsyncSession) -> ZoomCapabilitiesResponse:
        accounts = [a for a in await all_credentials(session) if a.sdk_enabled or a.api_enabled]
        options = [
            ZoomAccountOption(id=a.id or ENV_ACCOUNT_ID, name=a.name, auto_create=a.api_enabled and a.sdk_enabled)
            for a in accounts
        ]
        return ZoomCapabilitiesResponse(auto_create=any(o.auto_create for o in options), accounts=options)
