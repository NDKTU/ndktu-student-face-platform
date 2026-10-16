"""Fanlar va ularning a'zolari, filtr tanlovlari."""

from __future__ import annotations



from sqlalchemy import and_, delete, func, literal, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import Role, Student, Teacher, User, UserRole
from app.modules.organization_structure.model import Faculty, Group, Kafedra

from .model import (
    GeneralTest,
    GeneralTestQuestion,
    GeneralTestSubject,
    GeneralTestSubjectUser,
)
from .schemas import (
    FilterOption,
    FilterOptionsResponse,
    GroupOption,
    GroupOptionListResponse,
    SubjectCreateRequest,
    SubjectListResponse,
    SubjectSummary,
    SubjectUpdateRequest,
    SubjectUserListResponse,
    SubjectUserRow,
    SubjectUsersAddRequest,
    SubjectUsersAddResponse,
    UserFilter,
    UserListRequest,
)
from app.core.errors import Conflict, Forbidden, Invalid
from .common import _latest_student, _user_kind
from .errors import _not_found


class SubjectsMixin:
    # ── Fan ──────────────────────────────────────────────────────────────────

    async def _get_subject(
        self,
        session: AsyncSession,
        subject_id: int,
        user: User | None = None,
        *,
        member: bool = False,
        view: bool = False,
    ) -> GeneralTestSubject:
        """`member=True` — fanga biriktirilganga ham ruxsat (koʻrish, savol qoʻshish).

        `view=True` — faqat koʻrish: butun universitetni koʻradigan rolga ham ochiq.
        """
        subject = await session.get(GeneralTestSubject, subject_id)
        if subject is None:
            raise _not_found("Fan")
        if user is None or self._can_manage(subject, user, await self._manages_all(session, user)):
            return subject
        if member and await self._is_member(session, subject_id, user.id):
            return subject
        if view and await self._sees_all(session, user):
            return subject
        raise Forbidden("general_test_subject_not_yours", "Bu fan sizniki emas")

    async def _ensure_unique_name(self, session: AsyncSession, name: str, exclude_id: int | None = None) -> None:
        stmt = select(GeneralTestSubject.id).where(func.lower(GeneralTestSubject.name) == name.lower())
        if exclude_id is not None:
            stmt = stmt.where(GeneralTestSubject.id != exclude_id)
        if (await session.execute(stmt.limit(1))).scalar_one_or_none() is not None:
            raise Conflict("general_test_subject_name_taken", "Bunday nomli fan allaqachon bor")

    async def _subject_counts(
        self, session: AsyncSession, subject_ids: list[int]
    ) -> tuple[dict[int, int], dict[int, int], dict[int, int]]:
        """Har bir fanga biriktirilgan foydalanuvchilar, testlar va bankdagi savollar soni."""
        if not subject_ids:
            return {}, {}, {}
        users = dict(
            (
                await session.execute(
                    select(GeneralTestSubjectUser.subject_id, func.count())
                    .where(GeneralTestSubjectUser.subject_id.in_(subject_ids))
                    .group_by(GeneralTestSubjectUser.subject_id)
                )
            ).all()
        )
        tests = dict(
            (
                await session.execute(
                    select(GeneralTest.subject_id, func.count())
                    .where(GeneralTest.subject_id.in_(subject_ids))
                    .group_by(GeneralTest.subject_id)
                )
            ).all()
        )
        questions = dict(
            (
                await session.execute(
                    select(GeneralTestQuestion.subject_id, func.count())
                    .where(GeneralTestQuestion.subject_id.in_(subject_ids))
                    .group_by(GeneralTestQuestion.subject_id)
                )
            ).all()
        )
        return users, tests, questions

    def _subject_row(
        self, subject: GeneralTestSubject, counts, user: User, manages_all: bool = False
    ) -> SubjectSummary:
        users, tests, questions = counts
        return SubjectSummary(
            can_manage=self._can_manage(subject, user, manages_all),
            id=subject.id,
            name=subject.name,
            description=subject.description,
            created_at=subject.created_at,
            user_count=users.get(subject.id, 0),
            test_count=tests.get(subject.id, 0),
            question_count=questions.get(subject.id, 0),
        )

    async def _subject_summary(
        self, session: AsyncSession, subject: GeneralTestSubject, user: User
    ) -> SubjectSummary:
        return self._subject_row(
            subject, await self._subject_counts(session, [subject.id]), user, await self._manages_all(session, user)
        )

    async def list_subjects(
        self, session: AsyncSession, page: int, limit: int, search: str | None, user: User
    ) -> SubjectListResponse:
        stmt = select(GeneralTestSubject)
        manages_all = await self._manages_all(session, user)
        if not manages_all and not await self._sees_all(session, user):
            assigned = select(GeneralTestSubjectUser.subject_id).where(GeneralTestSubjectUser.user_id == user.id)
            stmt = stmt.where(
                or_(GeneralTestSubject.created_by_user_id == user.id, GeneralTestSubject.id.in_(assigned))
            )
        if search and search.strip():
            stmt = stmt.where(GeneralTestSubject.name.ilike(f"%{search.strip()}%"))
        total = (await session.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
        subjects = (
            (
                await session.execute(
                    stmt.order_by(GeneralTestSubject.name, GeneralTestSubject.id)
                    .offset((page - 1) * limit)
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
        counts = await self._subject_counts(session, [s.id for s in subjects])
        return SubjectListResponse(
            total=total,
            page=page,
            limit=limit,
            subjects=[self._subject_row(s, counts, user, manages_all) for s in subjects],
        )

    async def get_subject(self, session: AsyncSession, subject_id: int, user: User) -> SubjectSummary:
        subject = await self._get_subject(session, subject_id, user, member=True, view=True)
        return await self._subject_summary(session, subject, user)

    async def create_subject(self, session: AsyncSession, data: SubjectCreateRequest, user: User) -> SubjectSummary:
        await self._ensure_unique_name(session, data.name)
        subject = GeneralTestSubject(
            name=data.name,
            description=(data.description or "").strip() or None,
            created_by_user_id=user.id,
        )
        session.add(subject)
        await session.commit()
        await session.refresh(subject)
        return await self._subject_summary(session, subject, user)

    async def update_subject(
        self, session: AsyncSession, subject_id: int, data: SubjectUpdateRequest, user: User
    ) -> SubjectSummary:
        subject = await self._get_subject(session, subject_id, user)
        values = data.model_dump(exclude_unset=True)
        renamed = bool(values.get("name")) and values["name"] != subject.name
        if values.get("name"):
            await self._ensure_unique_name(session, values["name"], exclude_id=subject_id)
            subject.name = values["name"]
        if "description" in values:
            subject.description = (values["description"] or "").strip() or None
        if renamed:
            # Testlar nomi fan nomidan tuziladi.
            await session.flush()
            for test_id in (
                await session.execute(select(GeneralTest.id).where(GeneralTest.subject_id == subject_id))
            ).scalars():
                await self._retitle(session, test_id)
        await session.commit()
        await session.refresh(subject)
        return await self._subject_summary(session, subject, user)

    async def delete_subject(self, session: AsyncSession, subject_id: int, user: User) -> None:
        subject = await self._get_subject(session, subject_id, user)
        has_tests = (
            await session.execute(select(GeneralTest.id).where(GeneralTest.subject_id == subject_id).limit(1))
        ).scalar_one_or_none()
        if has_tests is not None:
            raise Conflict(
                "general_test_subject_has_tests",
                "Fanda testlar bor. Avval testlarni o'chiring yoki boshqa fanga o'tkazing",
            )
        await session.delete(subject)
        await session.commit()

    # ── Fan foydalanuvchilari ────────────────────────────────────────────────

    def _users_stmt(self, flt: UserFilter):
        """Faol foydalanuvchilar: ism, login, guruh va turi bilan.

        O'qituvchi fakulteti kafedra orqali olinadi — «fakultet» filtri
        talabani guruhi, o'qituvchini kafedrasi bo'yicha topadi.
        """
        student = _latest_student()
        full_name = func.coalesce(student.c.full_name, Teacher.full_name, User.username)
        stmt = (
            select(
                User.id,
                User.username,
                full_name.label("full_name"),
                Group.name.label("group_name"),
                student.c.id.label("student_id"),
                Teacher.id.label("teacher_id"),
            )
            .select_from(User)
            .outerjoin(student, student.c.user_id == User.id)
            .outerjoin(Group, Group.id == student.c.group_id)
            .outerjoin(Teacher, Teacher.user_id == User.id)
            .outerjoin(Kafedra, Kafedra.id == Teacher.kafedra_id)
            .where(User.is_active.is_(True))
        )
        if flt.kind == "student":
            stmt = stmt.where(student.c.id.is_not(None))
        elif flt.kind == "teacher":
            stmt = stmt.where(Teacher.id.is_not(None))
        elif flt.kind == "other":
            stmt = stmt.where(student.c.id.is_(None), Teacher.id.is_(None))
        if flt.role_id:
            stmt = stmt.where(
                select(UserRole.id).where(UserRole.user_id == User.id, UserRole.role_id == flt.role_id).exists()
            )
        if flt.faculty_id:
            stmt = stmt.where(or_(Group.faculty_id == flt.faculty_id, Kafedra.faculty_id == flt.faculty_id))
        if flt.group_id:
            stmt = stmt.where(student.c.group_id == flt.group_id)
        if flt.course:
            stmt = stmt.where(Group.course == flt.course)
        if flt.search and flt.search.strip():
            like = f"%{flt.search.strip()}%"
            stmt = stmt.where(
                or_(
                    student.c.full_name.ilike(like),
                    Teacher.full_name.ilike(like),
                    User.username.ilike(like),
                    Group.name.ilike(like),
                )
            )
        return stmt, full_name

    async def _page_users(
        self, session: AsyncSession, stmt, full_name, request: UserListRequest, with_assigned: bool
    ) -> SubjectUserListResponse:
        total = (await session.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
        rows = (
            await session.execute(
                stmt.order_by(full_name, User.id).offset((request.page - 1) * request.limit).limit(request.limit)
            )
        ).all()
        return SubjectUserListResponse(
            total=total,
            page=request.page,
            limit=request.limit,
            users=[
                SubjectUserRow(
                    user_id=r.id,
                    full_name=r.full_name or "—",
                    username=r.username,
                    user_kind=_user_kind(r.student_id, r.teacher_id),
                    group_name=r.group_name,
                    assigned=bool(r.assigned) if with_assigned else True,
                )
                for r in rows
            ],
        )

    async def list_subject_users(
        self, session: AsyncSession, subject_id: int, request: UserListRequest, user: User
    ) -> SubjectUserListResponse:
        await self._get_subject(session, subject_id, user)
        stmt, full_name = self._users_stmt(request)
        stmt = stmt.join(
            GeneralTestSubjectUser,
            and_(GeneralTestSubjectUser.user_id == User.id, GeneralTestSubjectUser.subject_id == subject_id),
        )
        return await self._page_users(session, stmt, full_name, request, with_assigned=False)

    async def list_candidates(
        self, session: AsyncSession, subject_id: int, request: UserListRequest, user: User
    ) -> SubjectUserListResponse:
        """Fanga qo'shish uchun foydalanuvchilar — o'qituvchi bo'lishi shart emas."""
        await self._get_subject(session, subject_id, user)
        stmt, full_name = self._users_stmt(request)
        assigned = (
            select(GeneralTestSubjectUser.id)
            .where(GeneralTestSubjectUser.subject_id == subject_id, GeneralTestSubjectUser.user_id == User.id)
            .exists()
        )
        stmt = stmt.add_columns(assigned.label("assigned"))
        return await self._page_users(session, stmt, full_name, request, with_assigned=True)

    async def add_subject_users(
        self, session: AsyncSession, subject_id: int, data: SubjectUsersAddRequest, user: User
    ) -> SubjectUsersAddResponse:
        await self._get_subject(session, subject_id, user)
        if data.filter is not None:
            stmt, _ = self._users_stmt(data.filter)
            ids = stmt.with_only_columns(User.id).subquery()
            source = select(literal(subject_id), ids.c.id)
        elif data.user_ids:
            source = select(literal(subject_id), User.id).where(User.id.in_(set(data.user_ids)))
        else:
            raise Invalid("general_test_user_required", "Foydalanuvchi tanlanmagan")

        result = await session.execute(
            pg_insert(GeneralTestSubjectUser)
            .from_select(["subject_id", "user_id"], source)
            .on_conflict_do_nothing(constraint="uq_general_test_subject_user")
        )
        await session.commit()
        return SubjectUsersAddResponse(added=max(result.rowcount or 0, 0))

    async def remove_subject_user(
        self, session: AsyncSession, subject_id: int, user_id: int, user: User
    ) -> None:
        await self._get_subject(session, subject_id, user)
        result = await session.execute(
            delete(GeneralTestSubjectUser).where(
                GeneralTestSubjectUser.subject_id == subject_id, GeneralTestSubjectUser.user_id == user_id
            )
        )
        if not result.rowcount:
            raise _not_found("Biriktirilgan foydalanuvchi")
        await session.commit()

    async def filter_options(self, session: AsyncSession) -> FilterOptionsResponse:
        roles = (await session.execute(select(Role.id, Role.name).order_by(Role.name))).all()
        faculties = (
            await session.execute(
                select(Faculty.id, Faculty.name).where(Faculty.is_active.is_(True)).order_by(Faculty.name)
            )
        ).all()
        return FilterOptionsResponse(
            roles=[FilterOption(id=r.id, name=r.name) for r in roles],
            faculties=[FilterOption(id=f.id, name=f.name) for f in faculties],
        )

    # ── Guruhlar ─────────────────────────────────────────────────────────────

    async def _group_options(self, session: AsyncSession, stmt) -> list[GroupOption]:
        """Guruhlar fakultet nomi va tizimga kira oladigan talabalar soni bilan."""
        counts = (
            select(Student.group_id, func.count(func.distinct(Student.user_id)).label("n"))
            .where(Student.user_id.is_not(None))
            .group_by(Student.group_id)
            .subquery()
        )
        rows = (
            await session.execute(
                stmt.add_columns(Faculty.name.label("faculty_name"), func.coalesce(counts.c.n, 0).label("n"))
                .outerjoin(Faculty, Faculty.id == Group.faculty_id)
                .outerjoin(counts, counts.c.group_id == Group.id)
                .order_by(Group.name, Group.id)
            )
        ).all()
        return [
            GroupOption(id=r[0].id, name=r[0].name, faculty_name=r.faculty_name, course=r[0].course, student_count=r.n)
            for r in rows
        ]

    async def group_options(
        self, session: AsyncSession, search: str | None, faculty_id: int | None, course: int | None, limit: int
    ) -> GroupOptionListResponse:
        stmt = select(Group).where(Group.is_active.is_(True))
        if search and search.strip():
            stmt = stmt.where(Group.name.ilike(f"%{search.strip()}%"))
        if faculty_id:
            stmt = stmt.where(Group.faculty_id == faculty_id)
        if course:
            stmt = stmt.where(Group.course == course)
        return GroupOptionListResponse(groups=await self._group_options(session, stmt.limit(limit)))
