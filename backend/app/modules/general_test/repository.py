from __future__ import annotations

import io
import logging
import random
import secrets
from datetime import timedelta

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import and_, delete, func, literal, or_, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.mixins.time_stamp_mixin import utcnow_naive
from app.modules.auth.model import Role, Student, Teacher, User, UserRole
from app.modules.organization_structure.model import Faculty, Group, Kafedra
from app.modules.quiz.question.excel_format import parse_correct_option, read_question_sheet
from app.modules.quiz.quiz_process import strict

from .model import (
    GeneralTest,
    GeneralTestAnswer,
    GeneralTestAttempt,
    GeneralTestGroup,
    GeneralTestQuestion,
    GeneralTestSubject,
    GeneralTestSubjectUser,
)
from .schemas import (
    AnswerRequest,
    AttemptResult,
    AttemptState,
    AvailableTest,
    AvailableTestListResponse,
    FilterOption,
    FilterOptionsResponse,
    GeneralTestCreateRequest,
    GeneralTestDetail,
    GeneralTestListResponse,
    GeneralTestSummary,
    GeneralTestUpdateRequest,
    GroupOption,
    GroupOptionListResponse,
    HeartbeatResponse,
    LeaveRequest,
    MyResultListResponse,
    QuestionCreateRequest,
    QuestionUpdateRequest,
    ResultListRequest,
    ResultListResponse,
    ResultRow,
    SubjectCreateRequest,
    SubjectListResponse,
    SubjectQuestionListResponse,
    SubjectSummary,
    SubjectUpdateRequest,
    SubjectUserListResponse,
    SubjectUserRow,
    SubjectUsersAddRequest,
    SubjectUsersAddResponse,
    TakeOption,
    TakeQuestion,
    TestGroup,
    TestGroupsAddRequest,
    TestGroupUpdateRequest,
    UploadResponse,
    UserFilter,
    UserListRequest,
)

logger = logging.getLogger(__name__)

LETTERS = ("a", "b", "c", "d")

#: Запас поверх длительности: последний ответ мог уйти на границе срока и
#: задержаться в сети. То же значение, что у обычного теста (quiz_process/attempt.py).
GRACE_SECONDS = 60

IN_PROGRESS = "in_progress"
COMPLETED = "completed"


def _not_found(what: str = "Test") -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} topilmadi")


#: Redis kalitlari prefiksi: `Result` id lari bilan to'qnashmasin.
STRICT_KIND = "gtest"


def _closed_left_page(reason: str) -> HTTPException:
    """Qat'iy testda urinish yopildi — kod `quiz_process/errors.py` dagi bilan bir xil."""
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"code": "attempt_closed_left_page", "message": f"Test yopildi: {reason.lower()}", "reason": reason},
    )


def _new_pin() -> str:
    """4 xonali PIN — talaba doskadan ko'chirib yozadi, shuning uchun qisqa."""
    return f"{secrets.randbelow(10000):04d}"


def _deadline(attempt: GeneralTestAttempt, test: GeneralTest):
    return attempt.started_at + timedelta(minutes=attempt.duration or test.duration)


def _remaining_seconds(attempt: GeneralTestAttempt, test: GeneralTest) -> int:
    return max(0, int((_deadline(attempt, test) - utcnow_naive()).total_seconds()))


def _is_expired(attempt: GeneralTestAttempt, test: GeneralTest) -> bool:
    return utcnow_naive() > _deadline(attempt, test) + timedelta(seconds=GRACE_SECONDS)


def _latest_student():
    """Har bir foydalanuvchining bitta talaba yozuvi — oxirgisi.

    `students.user_id` не уникален (бывают повторные записи из HEMIS):
    прямой join размножил бы строку. Берём одну — последнюю.
    """
    return (
        select(Student.id, Student.user_id, Student.full_name, Student.group_id)
        .distinct(Student.user_id)
        .where(Student.user_id.is_not(None))
        .order_by(Student.user_id, Student.id.desc())
        .subquery()
    )


def _visible_to(user_id: int):
    """Test shu foydalanuvchiga ko'rinadimi (faollikdan tashqari).

    Ikki yo'l: foydalanuvchi testning faniga biriktirilgan yoki testga
    biriktirilgan guruhlardan birida o'qiydi. Ikkalasi ham bo'lmasa — hech kim
    ko'rmaydi: «hamma uchun» degan holat endi yo'q.
    """
    own_groups = select(Student.group_id).where(Student.user_id == user_id, Student.group_id.is_not(None))
    by_subject = (
        select(GeneralTestSubjectUser.id)
        .where(
            GeneralTestSubjectUser.subject_id == GeneralTest.subject_id,
            GeneralTestSubjectUser.user_id == user_id,
        )
        .exists()
    )
    # Yashirilgan guruh (`is_active = false`) hisobga olinmaydi: test unga
    # biriktirilgan bo'lib qoladi, lekin talabalari uni ko'rmaydi.
    by_group = (
        select(GeneralTestGroup.id)
        .where(
            GeneralTestGroup.test_id == GeneralTest.id,
            GeneralTestGroup.group_id.in_(own_groups),
            GeneralTestGroup.is_active.is_(True),
        )
        .exists()
    )
    return or_(by_subject, by_group)


#: Nomda shuncha guruh yoziladi, qolgani «va yana N ta guruh» bo'lib qisqaradi.
TITLE_GROUPS = 3


def _compose_title(subject_name: str, group_names: list[str]) -> str:
    """Test nomi: «Fan — 101-21, 102-21». Guruhsiz — fan nomining o'zi."""
    names = sorted(group_names)
    if not names:
        return subject_name[:255]
    shown = ", ".join(names[:TITLE_GROUPS])
    rest = len(names) - TITLE_GROUPS
    tail = f" va yana {rest} ta guruh" if rest > 0 else ""
    return f"{subject_name} — {shown}{tail}"[:255]


def _per_attempt(test: GeneralTest, available: int) -> int:
    """Bitta urinishga beriladigan savollar: sozlangan son, lekin bor savoldan ko'p emas."""
    return min(test.question_number, available) if test.question_number else available


def _user_kind(student_id: int | None, teacher_id: int | None) -> str:
    return "student" if student_id else "teacher" if teacher_id else "boshqa"


class GeneralTestRepository:
    # ── Egalik ───────────────────────────────────────────────────────────────
    #
    # Elementar testlarni endi oʻqituvchi ham tuzadi. `created_by_user_id`
    # ilgari ham yozilardi, lekin hech qayerda tekshirilmasdi: roʻyxatlar
    # hammasini qaytarardi, tahrirlash va oʻchirish esa egasiga qaramasdi.
    # Ruxsatni shundayligicha oʻqituvchiga berish — har bir oʻqituvchiga
    # begona testlarni (va ularning savollar bankini) ochib qoʻyish degani
    # edi. Shuning uchun avval egalik, keyin ruxsat.
    #
    # Admin hammasini koʻradi: unga umumiy nazorat kerak.
    #
    # Fanga biriktirilgan foydalanuvchi (`general_test_subject_users`) fanni
    # koʻradi va bankiga faqat savol qoʻshadi (qoʻlda yoki Excel'dan). Fanni
    # tahrirlash, oʻchirish, biriktirishlar, test tuzish, savolni tahrirlash
    # va oʻchirish — egasida: begona savolni buzib qoʻyish mumkin boʻlmasin.

    @staticmethod
    def _is_admin(user: User) -> bool:
        return any(role.name.lower() == "admin" for role in user.roles)

    def _own_only(self, stmt, model, user: User):
        """Roʻyxat soʻrovini egasi boʻyicha cheklaydi (admin uchun — yoʻq)."""
        if self._is_admin(user):
            return stmt
        return stmt.where(model.created_by_user_id == user.id)

    def _ensure_owner(self, obj, user: User, detail: str) -> None:
        if self._is_admin(user) or obj.created_by_user_id == user.id:
            return
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)

    def _can_manage(self, subject: GeneralTestSubject, user: User) -> bool:
        return self._is_admin(user) or subject.created_by_user_id == user.id

    @staticmethod
    async def _is_member(session: AsyncSession, subject_id: int, user_id: int) -> bool:
        stmt = select(GeneralTestSubjectUser.id).where(
            GeneralTestSubjectUser.subject_id == subject_id, GeneralTestSubjectUser.user_id == user_id
        )
        return (await session.execute(stmt.limit(1))).scalar_one_or_none() is not None

    # ── Fan ──────────────────────────────────────────────────────────────────

    async def _get_subject(
        self, session: AsyncSession, subject_id: int, user: User | None = None, *, member: bool = False
    ) -> GeneralTestSubject:
        """`member=True` — fanga biriktirilganga ham ruxsat (koʻrish, savol qoʻshish)."""
        subject = await session.get(GeneralTestSubject, subject_id)
        if subject is None:
            raise _not_found("Fan")
        if user is None or self._can_manage(subject, user):
            return subject
        if member and await self._is_member(session, subject_id, user.id):
            return subject
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu fan sizniki emas")

    async def _ensure_unique_name(self, session: AsyncSession, name: str, exclude_id: int | None = None) -> None:
        stmt = select(GeneralTestSubject.id).where(func.lower(GeneralTestSubject.name) == name.lower())
        if exclude_id is not None:
            stmt = stmt.where(GeneralTestSubject.id != exclude_id)
        if (await session.execute(stmt.limit(1))).scalar_one_or_none() is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bunday nomli fan allaqachon bor")

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

    def _subject_row(self, subject: GeneralTestSubject, counts, user: User) -> SubjectSummary:
        users, tests, questions = counts
        return SubjectSummary(
            can_manage=self._can_manage(subject, user),
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
        return self._subject_row(subject, await self._subject_counts(session, [subject.id]), user)

    async def list_subjects(
        self, session: AsyncSession, page: int, limit: int, search: str | None, user: User
    ) -> SubjectListResponse:
        stmt = select(GeneralTestSubject)
        if not self._is_admin(user):
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
            subjects=[self._subject_row(s, counts, user) for s in subjects],
        )

    async def get_subject(self, session: AsyncSession, subject_id: int, user: User) -> SubjectSummary:
        subject = await self._get_subject(session, subject_id, user, member=True)
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
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Fanda testlar bor. Avval testlarni o'chiring yoki boshqa fanga o'tkazing",
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
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Foydalanuvchi tanlanmagan")

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

    async def add_test_groups(
        self, session: AsyncSession, test_id: int, data: TestGroupsAddRequest, user: User
    ) -> GeneralTestDetail:
        await self._get_test(session, test_id, user)
        await session.execute(
            pg_insert(GeneralTestGroup)
            .from_select(
                ["test_id", "group_id"],
                select(literal(test_id), Group.id).where(Group.id.in_(set(data.group_ids))),
            )
            .on_conflict_do_nothing(constraint="uq_general_test_group")
        )
        await self._retitle(session, test_id)
        await session.commit()
        return await self.get_test(session, test_id, user)

    async def set_test_group_active(
        self, session: AsyncSession, test_id: int, group_id: int, data: TestGroupUpdateRequest, user: User
    ) -> GeneralTestDetail:
        """Guruh uchun testni yoqadi yoki yashiradi — biriktirmani o'chirmasdan."""
        await self._get_test(session, test_id, user)
        result = await session.execute(
            update(GeneralTestGroup)
            .where(GeneralTestGroup.test_id == test_id, GeneralTestGroup.group_id == group_id)
            .values(is_active=data.is_active)
        )
        if not result.rowcount:
            raise _not_found("Biriktirilgan guruh")
        await session.commit()
        return await self.get_test(session, test_id, user)

    async def remove_test_group(
        self, session: AsyncSession, test_id: int, group_id: int, user: User
    ) -> GeneralTestDetail:
        await self._get_test(session, test_id, user)
        result = await session.execute(
            delete(GeneralTestGroup).where(GeneralTestGroup.test_id == test_id, GeneralTestGroup.group_id == group_id)
        )
        if not result.rowcount:
            raise _not_found("Biriktirilgan guruh")
        await self._retitle(session, test_id)
        await session.commit()
        return await self.get_test(session, test_id, user)

    # ── Тест ─────────────────────────────────────────────────────────────────

    async def _retitle(self, session: AsyncSession, test_id: int) -> None:
        """Nomni bazadagi joriy fan va guruhlardan qayta tuzadi (commit chaqiruvchida)."""
        subject_name = (
            await session.execute(
                select(GeneralTestSubject.name)
                .join(GeneralTest, GeneralTest.subject_id == GeneralTestSubject.id)
                .where(GeneralTest.id == test_id)
            )
        ).scalar_one()
        group_names = (
            (
                await session.execute(
                    select(Group.name)
                    .join(GeneralTestGroup, GeneralTestGroup.group_id == Group.id)
                    .where(GeneralTestGroup.test_id == test_id)
                )
            )
            .scalars()
            .all()
        )
        await session.execute(
            update(GeneralTest)
            .where(GeneralTest.id == test_id)
            .values(title=_compose_title(subject_name, list(group_names)))
            .execution_options(synchronize_session="fetch")
        )

    async def _get_test(
        self, session: AsyncSession, test_id: int, user: User | None = None
    ) -> GeneralTest:
        stmt = select(GeneralTest).options(selectinload(GeneralTest.subject)).where(GeneralTest.id == test_id)
        test = (await session.execute(stmt)).scalar_one_or_none()
        if test is None:
            raise _not_found()
        if user is not None:
            self._ensure_owner(test, user, "Bu test sizniki emas")
        return test

    async def _counts(
        self, session: AsyncSession, test_ids: list[int]
    ) -> tuple[dict[int, int], dict[int, int], dict[int, int]]:
        """Вопросы в банке fan'а, завершённые попытки и назначенные группы по каждому тесту."""
        if not test_ids:
            return {}, {}, {}
        # Иначе в «попытках» не учитывались бы просроченные, но не закрытые.
        await self._close_expired(session, test_ids=test_ids)
        questions = dict(
            (
                await session.execute(
                    select(GeneralTest.id, func.count(GeneralTestQuestion.id))
                    .join(GeneralTestQuestion, GeneralTestQuestion.subject_id == GeneralTest.subject_id)
                    .where(GeneralTest.id.in_(test_ids))
                    .group_by(GeneralTest.id)
                )
            ).all()
        )
        attempts = dict(
            (
                await session.execute(
                    select(GeneralTestAttempt.test_id, func.count())
                    .where(GeneralTestAttempt.test_id.in_(test_ids), GeneralTestAttempt.status == COMPLETED)
                    .group_by(GeneralTestAttempt.test_id)
                )
            ).all()
        )
        groups = dict(
            (
                await session.execute(
                    select(GeneralTestGroup.test_id, func.count())
                    .where(GeneralTestGroup.test_id.in_(test_ids))
                    .group_by(GeneralTestGroup.test_id)
                )
            ).all()
        )
        return questions, attempts, groups

    @staticmethod
    def _with_counts(test: GeneralTest, counts) -> GeneralTestSummary:
        questions, attempts, groups = counts
        return GeneralTestSummary.model_validate(test).model_copy(
            update={
                "question_count": questions.get(test.id, 0),
                "attempt_count": attempts.get(test.id, 0),
                "group_count": groups.get(test.id, 0),
            }
        )

    async def _summary(self, session: AsyncSession, test: GeneralTest) -> GeneralTestSummary:
        return self._with_counts(test, await self._counts(session, [test.id]))

    async def list_tests(
        self,
        session: AsyncSession,
        page: int,
        limit: int,
        search: str | None,
        user: User,
        subject_id: int | None = None,
    ) -> GeneralTestListResponse:
        stmt = self._own_only(
            select(GeneralTest).options(selectinload(GeneralTest.subject)), GeneralTest, user
        )
        if search and search.strip():
            stmt = stmt.where(GeneralTest.title.ilike(f"%{search.strip()}%"))
        if subject_id:
            stmt = stmt.where(GeneralTest.subject_id == subject_id)
        total = (await session.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
        tests = (
            (
                await session.execute(
                    stmt.order_by(GeneralTest.id.desc()).offset((page - 1) * limit).limit(limit)
                )
            )
            .scalars()
            .all()
        )
        counts = await self._counts(session, [t.id for t in tests])
        return GeneralTestListResponse(
            total=total,
            page=page,
            limit=limit,
            tests=[self._with_counts(t, counts) for t in tests],
        )

    async def get_test(self, session: AsyncSession, test_id: int, user: User) -> GeneralTestDetail:
        test = await self._get_test(session, test_id, user)
        summary = await self._summary(session, test)
        groups = await self._group_options(
            session,
            select(Group).join(GeneralTestGroup, GeneralTestGroup.group_id == Group.id).where(
                GeneralTestGroup.test_id == test_id
            ),
        )
        active = dict(
            (
                await session.execute(
                    select(GeneralTestGroup.group_id, GeneralTestGroup.is_active).where(
                        GeneralTestGroup.test_id == test_id
                    )
                )
            ).all()
        )
        return GeneralTestDetail(
            **summary.model_dump(),
            groups=[TestGroup(**group.model_dump(), is_active=active.get(group.id, True)) for group in groups],
        )

    async def create_test(
        self, session: AsyncSession, data: GeneralTestCreateRequest, user: User
    ) -> GeneralTestDetail:
        # Fan ham oʻzinikidan boʻlishi kerak: aks holda oʻqituvchi begona
        # bankka oʻz testini ulab, uning savollarini tarqatib yuborardi.
        subject = await self._get_subject(session, data.subject_id, user)
        test = GeneralTest(
            **data.model_dump(exclude={"group_ids", "pin_required"}),
            title=subject.name,
            pin=_new_pin() if data.pin_required else None,
            created_by_user_id=user.id,
        )
        session.add(test)
        await session.flush()
        if data.group_ids:
            await session.execute(
                pg_insert(GeneralTestGroup)
                .from_select(
                    ["test_id", "group_id"],
                    select(literal(test.id), Group.id).where(Group.id.in_(set(data.group_ids))),
                )
                .on_conflict_do_nothing(constraint="uq_general_test_group")
            )
            await self._retitle(session, test.id)
        await session.commit()
        return await self.get_test(session, test.id, user)

    async def update_test(
        self, session: AsyncSession, test_id: int, data: GeneralTestUpdateRequest, user: User
    ) -> GeneralTestDetail:
        test = await self._get_test(session, test_id, user)
        subject_changed = False
        changes = data.model_dump(exclude_unset=True)
        pin_required = changes.pop("pin_required", None)
        regenerate_pin = changes.pop("regenerate_pin", False)
        if changes.get("strict_mode", False) is None:
            changes.pop("strict_mode")
        if pin_required is False:
            test.pin = None
        elif (pin_required and test.pin is None) or (regenerate_pin and (pin_required or test.pin)):
            test.pin = _new_pin()
        for field, value in changes.items():
            if field == "subject_id":
                if value is None or value == test.subject_id:
                    continue
                await self._get_subject(session, value, user)
                subject_changed = True
            setattr(test, field, value)
        if subject_changed:
            await session.flush()
            await self._retitle(session, test_id)
        await session.commit()
        # Sessiya `expire_on_commit=False`: yuklangan `test.subject` fan
        # almashtirilgandan keyin ham eskisi bo'lib qolardi va javobda eski
        # fan nomi qaytardi.
        session.expire(test)
        return await self.get_test(session, test_id, user)

    async def delete_test(self, session: AsyncSession, test_id: int, user: User) -> None:
        test = await self._get_test(session, test_id, user)
        await session.delete(test)
        await session.commit()

    # ── Вопросы ──────────────────────────────────────────────────────────────

    async def _next_order(self, session: AsyncSession, subject_id: int) -> int:
        current = (
            await session.execute(
                select(func.max(GeneralTestQuestion.order)).where(GeneralTestQuestion.subject_id == subject_id)
            )
        ).scalar_one_or_none()
        return (current or 0) + 1

    async def list_subject_questions(
        self, session: AsyncSession, subject_id: int, user: User
    ) -> SubjectQuestionListResponse:
        await self._get_subject(session, subject_id, user, member=True)
        questions = (
            (
                await session.execute(
                    select(GeneralTestQuestion)
                    .where(GeneralTestQuestion.subject_id == subject_id)
                    .order_by(GeneralTestQuestion.order, GeneralTestQuestion.id)
                )
            )
            .scalars()
            .all()
        )
        return SubjectQuestionListResponse(questions=questions)

    async def create_question(
        self, session: AsyncSession, subject_id: int, data: QuestionCreateRequest, user: User
    ) -> GeneralTestQuestion:
        await self._get_subject(session, subject_id, user, member=True)
        payload = data.model_dump()
        if payload["order"] is None:
            payload["order"] = await self._next_order(session, subject_id)
        question = GeneralTestQuestion(subject_id=subject_id, **payload)
        session.add(question)
        await session.commit()
        await session.refresh(question)
        return question

    async def _get_question(
        self, session: AsyncSession, question_id: int, user: User | None = None
    ) -> GeneralTestQuestion:
        question = await session.get(GeneralTestQuestion, question_id)
        if question is None:
            raise _not_found("Savol")
        if user is not None:
            # Savolning oʻz egasi yoʻq — u bankka (fanga) tegishli, demak
            # huquq fan boʻyicha tekshiriladi.
            await self._get_subject(session, question.subject_id, user)
        return question

    async def update_question(
        self, session: AsyncSession, question_id: int, data: QuestionUpdateRequest, user: User
    ) -> GeneralTestQuestion:
        question = await self._get_question(session, question_id, user)
        for field, value in data.model_dump(exclude_unset=True).items():
            if value is not None:
                setattr(question, field, value)
        await session.commit()
        await session.refresh(question)
        return question

    async def delete_question(self, session: AsyncSession, question_id: int, user: User) -> None:
        question = await self._get_question(session, question_id, user)
        await session.delete(question)
        await session.commit()

    async def upload_questions_excel(
        self, session: AsyncSession, subject_id: int, file: UploadFile, user: User
    ) -> UploadResponse:
        """Вопросы из Excel — формат тот же, что у банка вопросов.

        Колонки ищутся по заголовкам (`quiz/question/excel_format.py`), так что
        шаблон и уже готовые файлы преподавателей подходят без переделки.
        """
        await self._get_subject(session, subject_id, user, member=True)
        try:
            # Sarlavha qatorini o'zi topadi: birinchi qator har doim sarlavha
            # deb olinmaydi (excel_format.read_question_sheet).
            sheet = read_question_sheet(await file.read())
        except Exception:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Excel faylni o'qib bo'lmadi")

        if sheet.width < 5:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Faylda kamida 5 ustun bo'lishi kerak: savol, A, B, C, D variantlar",
            )

        # Заголовки не узнаны — читаем по позиции, как и банк вопросов.
        mapping = sheet.mapping

        def cell(row: list, field: str, position: int) -> str:
            index = mapping.get(field, -1) if mapping is not None else position
            if index < 0 or index >= len(row) or row[index] is None:
                return ""
            return str(row[index]).strip()

        order = await self._next_order(session, subject_id)
        questions: list[GeneralTestQuestion] = []
        warnings: list[str] = list(sheet.notes)
        # Номер строки — настоящий, из Excel: заголовок может стоять не в первой строке.
        for line, row in sheet.rows:
            values = [cell(row, f, i) for i, f in enumerate(("text", "option_a", "option_b", "option_c", "option_d"))]
            if not any(values):
                continue
            if not all(values):
                warnings.append(f"{line}-qator: savol yoki variantlardan biri bo'sh — o'tkazib yuborildi")
                continue

            # To'g'ri javob — A varianti (shablonda alohida ustun yo'q).
            # Ustun faqat eski fayllarda bo'ladi va o'sha yerda hisobga
            # olinadi: aks holda ilgari tayyorlangan fayl qayta
            # yuklanganda barcha javoblar «a» ga ko'chib ketardi.
            correct = parse_correct_option(cell(row, "correct_option", 5)) or "a"

            text_, a, b, c, d = values
            questions.append(
                GeneralTestQuestion(
                    subject_id=subject_id,
                    text=text_,
                    option_a=a,
                    option_b=b,
                    option_c=c,
                    option_d=d,
                    correct_option=correct,
                    order=order,
                )
            )
            order += 1

        if not questions:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Faylda savol topilmadi")

        session.add_all(questions)
        await session.commit()
        return UploadResponse(created=len(questions), warnings=warnings)

    # ── Прохождение ──────────────────────────────────────────────────────────

    async def _finalize(self, session: AsyncSession, attempt: GeneralTestAttempt) -> None:
        """Подсчёт по текущим правильным ответам вопросов.

        Сверка идёт здесь, а не только при сохранении ответа: если админ
        исправил ключ, пока попытка шла, засчитается исправленный.
        """
        layout_ids = [item["q"] for item in attempt.layout]
        questions = {
            q.id: q
            for q in (
                await session.execute(select(GeneralTestQuestion).where(GeneralTestQuestion.id.in_(layout_ids)))
            ).scalars()
        }
        answers = (
            (await session.execute(select(GeneralTestAnswer).where(GeneralTestAnswer.attempt_id == attempt.id)))
            .scalars()
            .all()
        )
        correct = 0
        for answer in answers:
            question = questions.get(answer.question_id)
            answer.is_correct = question is not None and answer.selected_option == question.correct_option
            correct += answer.is_correct

        # Вопрос, удалённый из банка во время попытки, в знаменатель не идёт.
        total = len(questions)
        attempt.total_questions = total
        attempt.correct_answers = correct
        attempt.score = round(correct / total * 100) if total else 0
        attempt.status = COMPLETED
        attempt.finished_at = min(utcnow_naive(), _deadline(attempt, attempt.test))

    async def _close_expired(
        self, session: AsyncSession, user_id: int | None = None, test_ids: list[int] | None = None
    ) -> None:
        """Закрывает попытки, время которых вышло, а «Yakunlash» никто не нажал.

        Фоновой задачи нет, поэтому закрываем при чтении — и не только по
        запросам самого студента. Раньше так и было: студент, закрывший
        браузер, навсегда оставался «в процессе» и не попадал ни в результаты,
        ни в статистику, пока сам не вернётся. Теперь то же делают экраны
        преподавателя (результаты, экспорт, список и карточка теста).
        Без фильтров — все незавершённые попытки; их немного.
        """
        stmt = (
            select(GeneralTestAttempt)
            .options(selectinload(GeneralTestAttempt.test))
            .where(GeneralTestAttempt.status == IN_PROGRESS)
        )
        if user_id is not None:
            stmt = stmt.where(GeneralTestAttempt.user_id == user_id)
        if test_ids is not None:
            if not test_ids:
                return
            stmt = stmt.where(GeneralTestAttempt.test_id.in_(test_ids))
        # SKIP LOCKED: попытку, которую прямо сейчас завершает сам студент
        # (`_own_attempt` берёт FOR UPDATE), не трогаем и не ждём.
        attempts = (await session.execute(stmt.with_for_update(skip_locked=True, of=GeneralTestAttempt))).scalars().all()
        for attempt in attempts:
            if _is_expired(attempt, attempt.test):
                await self._finalize(session, attempt)
        if attempts:
            # Коммит и без изменений: он снимает блокировки, иначе ответы
            # студентов ждали бы конца этого (читающего) запроса.
            await session.commit()

    async def list_available(self, session: AsyncSession, user: User) -> AvailableTestListResponse:
        await self._close_expired(session, user.id)

        # Начатая попытка остаётся в списке, даже если тест успели выключить
        # или скрыть группу: иначе студент, у которого обновилась страница,
        # не нашёл бы, куда вернуться («Davom ettirish»).
        open_attempt = select(GeneralTestAttempt.test_id).where(
            GeneralTestAttempt.user_id == user.id, GeneralTestAttempt.status == IN_PROGRESS
        )
        active = (
            select(GeneralTest)
            .options(selectinload(GeneralTest.subject))
            .where(
                or_(
                    and_(GeneralTest.is_active.is_(True), _visible_to(user.id)),
                    GeneralTest.id.in_(open_attempt),
                )
            )
            .order_by(GeneralTest.id.desc())
        )
        tests = (await session.execute(active)).scalars().all()
        ids = [t.id for t in tests]
        question_counts, _, _ = await self._counts(session, ids)

        mine = (
            (
                await session.execute(
                    select(GeneralTestAttempt).where(
                        GeneralTestAttempt.user_id == user.id, GeneralTestAttempt.test_id.in_(ids)
                    )
                )
            )
            .scalars()
            .all()
            if ids
            else []
        )

        result = []
        for test in tests:
            own = [a for a in mine if a.test_id == test.id]
            in_progress = next((a.id for a in own if a.status == IN_PROGRESS), None)
            scores = [a.score for a in own if a.status == COMPLETED and a.score is not None]
            result.append(
                AvailableTest(
                    id=test.id,
                    subject_name=test.subject.name,
                    title=test.title,
                    duration=test.duration,
                    attempt_limit=test.attempt_limit,
                    question_count=_per_attempt(test, question_counts.get(test.id, 0)),
                    attempts_used=len(own),
                    in_progress_attempt_id=in_progress,
                    best_score=max(scores) if scores else None,
                    pin_required=test.pin is not None,
                    strict_mode=test.strict_mode,
                )
            )
        return AvailableTestListResponse(tests=result)

    async def _state(self, session: AsyncSession, attempt: GeneralTestAttempt) -> AttemptState:
        ids = [item["q"] for item in attempt.layout]
        questions = {
            q.id: q
            for q in (
                await session.execute(select(GeneralTestQuestion).where(GeneralTestQuestion.id.in_(ids)))
            ).scalars()
        }
        selected = dict(
            (
                await session.execute(
                    select(GeneralTestAnswer.question_id, GeneralTestAnswer.selected_option).where(
                        GeneralTestAnswer.attempt_id == attempt.id
                    )
                )
            ).all()
        )
        items = []
        for entry in attempt.layout:
            question = questions.get(entry["q"])
            if question is None:
                continue
            items.append(
                TakeQuestion(
                    id=question.id,
                    text=question.text,
                    options=[TakeOption(key=letter, text=question.option(letter)) for letter in entry["o"]],
                    selected=selected.get(question.id),
                )
            )
        return AttemptState(
            attempt_id=attempt.id,
            test_id=attempt.test_id,
            title=attempt.test.title,
            remaining_seconds=_remaining_seconds(attempt, attempt.test),
            questions=items,
            strict_mode=attempt.test.strict_mode,
        )

    async def start(self, session: AsyncSession, test_id: int, user: User, pin: str | None = None) -> AttemptState:
        # Двойной клик по «Boshlash» или две вкладки не должны создать две
        # попытки и съесть лимит: старт одного пользователя на один тест
        # выполняется строго по очереди.
        await session.execute(text("SELECT pg_advisory_xact_lock(:a, :b)"), {"a": 7301 + test_id, "b": user.id})

        test = await self._get_test(session, test_id)

        own = (
            (
                await session.execute(
                    select(GeneralTestAttempt)
                    .options(selectinload(GeneralTestAttempt.test))
                    .where(GeneralTestAttempt.test_id == test_id, GeneralTestAttempt.user_id == user.id)
                )
            )
            .scalars()
            .all()
        )

        # Возвращение в начатую попытку — раньше проверок активности и
        # видимости. Тест выключают, как только все зашли, а группу могут
        # скрыть; студент, у которого после этого упал браузер, уже внутри
        # и должен вернуться в собственную попытку (как в quiz_process).
        for attempt in own:
            if attempt.status != IN_PROGRESS:
                continue
            if not _is_expired(attempt, test):
                # Qat'iy testga qaytish — sahifadan chiqqan degani.
                if test.strict_mode and not await self._strict_young(session, attempt):
                    await self._close_left(session, attempt, "resume")
                return await self._state(session, attempt)
            await self._finalize(session, attempt)

        visible = (
            await session.execute(select(GeneralTest.id).where(GeneralTest.id == test_id, _visible_to(user.id)))
        ).scalar_one_or_none()
        # Biriktirilmagan foydalanuvchi uchun test yo'qdek: id ni terib kirib
        # bo'lmasin.
        if visible is None:
            await session.commit()
            raise _not_found()
        if not test.is_active:
            await session.commit()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Test faol emas")
        # PIN — только для новой попытки: вернуться в начатую можно без него.
        if test.pin is not None and (pin or "").strip() != test.pin:
            await session.commit()
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="PIN kod noto'g'ri")

        if len(own) >= test.attempt_limit:
            await session.commit()
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Urinishlar soni tugagan")

        # Savollar fanning bankidan — shu fanning barcha testlari uchun bitta.
        pool = (
            (await session.execute(select(GeneralTestQuestion.id).where(GeneralTestQuestion.subject_id == test.subject_id)))
            .scalars()
            .all()
        )
        if not pool:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bu fanda savollar yo'q")

        layout = []
        for question_id in random.sample(pool, _per_attempt(test, len(pool))):
            layout.append({"q": question_id, "o": "".join(random.sample(LETTERS, len(LETTERS)))})

        attempt = GeneralTestAttempt(
            test_id=test.id,
            user_id=user.id,
            status=IN_PROGRESS,
            started_at=utcnow_naive(),
            duration=test.duration,
            layout=layout,
            total_questions=len(layout),
        )
        session.add(attempt)
        await session.commit()
        await session.refresh(attempt, ["test"])
        if test.strict_mode:
            await strict.touch(attempt.id, STRICT_KIND)
        return await self._state(session, attempt)

    async def _strict_young(self, session: AsyncSession, attempt: GeneralTestAttempt) -> bool:
        """Urinish hozirgina boshlangan va javobsiz — boshlash javobi yo'qolgan bo'lishi mumkin."""
        if (utcnow_naive() - attempt.started_at).total_seconds() >= strict.RESUME_WINDOW_SECONDS:
            return False
        answered = await session.scalar(
            select(func.count()).select_from(GeneralTestAnswer).where(GeneralTestAnswer.attempt_id == attempt.id)
        )
        return not answered

    async def _close_left(self, session: AsyncSession, attempt: GeneralTestAttempt, reason_key: str | None) -> None:
        """Qat'iy testda urinishni «sahifadan chiqdi» deb yopadi va 409 beradi."""
        attempt.stop_reason = strict.leave_reason_text(reason_key)
        await self._finalize(session, attempt)
        await session.commit()
        await strict.forget(attempt.id, STRICT_KIND)
        raise _closed_left_page(attempt.stop_reason)

    async def _require_alive(self, session: AsyncSession, attempt: GeneralTestAttempt) -> None:
        """Heartbeat to'xtagan — sahifa yopilgan yoki fonda muzlagan."""
        if attempt.test.strict_mode and not await strict.is_alive(attempt.id, STRICT_KIND):
            await self._close_left(session, attempt, "heartbeat")

    async def _own_attempt(self, session: AsyncSession, attempt_id: int, user: User) -> GeneralTestAttempt:
        attempt = (
            await session.execute(
                select(GeneralTestAttempt)
                .options(selectinload(GeneralTestAttempt.test))
                .where(GeneralTestAttempt.id == attempt_id, GeneralTestAttempt.user_id == user.id)
                .with_for_update()
            )
        ).scalar_one_or_none()
        if attempt is None:
            raise _not_found("Urinish")
        return attempt

    async def get_state(self, session: AsyncSession, attempt_id: int, user: User) -> AttemptState:
        attempt = await self._own_attempt(session, attempt_id, user)
        if attempt.status != IN_PROGRESS:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Urinish yakunlangan")
        if _is_expired(attempt, attempt.test):
            await self._finalize(session, attempt)
            await session.commit()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Vaqt tugagan")
        # Test sahifasi urinishni shu yerdan oladi: ikkinchi ochilish — sahifa
        # yangilangan yoki «Davom ettirish» bosilgan, ya'ni talaba chiqqan.
        if attempt.test.strict_mode:
            ttl = _remaining_seconds(attempt, attempt.test) + 3600
            if not await strict.first_open(attempt.id, STRICT_KIND, ttl) and not await self._strict_young(
                session, attempt
            ):
                await self._close_left(session, attempt, "resume")
            await self._require_alive(session, attempt)
        return await self._state(session, attempt)

    async def answer(self, session: AsyncSession, attempt_id: int, data: AnswerRequest, user: User) -> None:
        attempt = await self._own_attempt(session, attempt_id, user)
        if attempt.status != IN_PROGRESS:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Urinish yakunlangan")
        if _is_expired(attempt, attempt.test):
            await self._finalize(session, attempt)
            await session.commit()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Vaqt tugagan")
        await self._require_alive(session, attempt)
        if data.question_id not in {item["q"] for item in attempt.layout}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Savol bu urinishga tegishli emas")

        stmt = pg_insert(GeneralTestAnswer).values(
            attempt_id=attempt.id,
            question_id=data.question_id,
            selected_option=data.option,
            created_at=utcnow_naive(),
            updated_at=utcnow_naive(),
        )
        await session.execute(
            stmt.on_conflict_do_update(
                constraint="uq_general_test_answer",
                set_={"selected_option": stmt.excluded.selected_option, "updated_at": stmt.excluded.updated_at},
            )
        )
        await session.commit()

    @staticmethod
    def _result(attempt: GeneralTestAttempt) -> AttemptResult:
        return AttemptResult(
            attempt_id=attempt.id,
            test_id=attempt.test_id,
            title=attempt.test.title,
            total_questions=attempt.total_questions,
            correct_answers=attempt.correct_answers or 0,
            score=attempt.score or 0,
            started_at=attempt.started_at,
            finished_at=attempt.finished_at,
            stop_reason=attempt.stop_reason,
        )

    async def finish(self, session: AsyncSession, attempt_id: int, user: User) -> AttemptResult:
        attempt = await self._own_attempt(session, attempt_id, user)
        # Повторное «Yakunlash» (двойной клик, ретрай сети) просто отдаёт итог.
        if attempt.status == IN_PROGRESS:
            await self._require_alive(session, attempt)
            await self._finalize(session, attempt)
            await session.commit()
        return self._result(attempt)

    async def leave(self, session: AsyncSession, attempt_id: int, data: LeaveRequest, user: User) -> AttemptResult:
        """Qat'iy test: brauzer sahifadan chiqilganini aytdi. Takroriy chaqiruv natijani qaytaradi."""
        attempt = await self._own_attempt(session, attempt_id, user)
        if attempt.status != IN_PROGRESS:
            return self._result(attempt)
        if not attempt.test.strict_mode:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"code": "strict_mode_disabled", "message": "Bu testda qat'iy rejim yoqilmagan"},
            )
        attempt.stop_reason = strict.leave_reason_text(data.reason)
        await self._finalize(session, attempt)
        await session.commit()
        await strict.forget(attempt.id, STRICT_KIND)
        return self._result(attempt)

    async def heartbeat(self, session: AsyncSession, attempt_id: int, user: User) -> HeartbeatResponse:
        """Sahifa ochiq. Muddati o'tgan heartbeat'ni tiriltirmaydi (`quiz_process` dagi kabi)."""
        attempt = await self._own_attempt(session, attempt_id, user)
        if attempt.status != IN_PROGRESS:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Urinish yakunlangan")
        if attempt.test.strict_mode:
            await self._require_alive(session, attempt)
            await strict.touch(attempt.id, STRICT_KIND)
        # FOR UPDATE qulfini bo'shatadi.
        await session.commit()
        return HeartbeatResponse()

    async def my_results(self, session: AsyncSession, user: User) -> MyResultListResponse:
        await self._close_expired(session, user.id)
        attempts = (
            (
                await session.execute(
                    select(GeneralTestAttempt)
                    .options(selectinload(GeneralTestAttempt.test))
                    .where(GeneralTestAttempt.user_id == user.id, GeneralTestAttempt.status == COMPLETED)
                    .order_by(GeneralTestAttempt.finished_at.desc())
                )
            )
            .scalars()
            .all()
        )
        return MyResultListResponse(results=[self._result(a) for a in attempts])

    # ── Результаты (администратор) ───────────────────────────────────────────

    def _results_stmt(self, request: ResultListRequest, user: User | None = None):
        """Natijalar soʻrovi.

        `user` berilsa va u admin boʻlmasa — faqat oʻz testlarining
        natijalari. Aks holda oʻqituvchi begona testni yechgan odamlarning
        roʻyxatini koʻrardi.
        """
        student = _latest_student()
        full_name = func.coalesce(student.c.full_name, Teacher.full_name, User.username, "—")
        stmt = (
            select(
                GeneralTestAttempt,
                GeneralTest.title,
                GeneralTestSubject.name.label("subject_name"),
                User.username,
                full_name.label("full_name"),
                Group.name.label("group_name"),
                student.c.id.label("student_id"),
                Teacher.id.label("teacher_id"),
            )
            .join(GeneralTest, GeneralTest.id == GeneralTestAttempt.test_id)
            .join(GeneralTestSubject, GeneralTestSubject.id == GeneralTest.subject_id)
            .outerjoin(User, User.id == GeneralTestAttempt.user_id)
            .outerjoin(student, student.c.user_id == User.id)
            .outerjoin(Group, Group.id == student.c.group_id)
            .outerjoin(Teacher, Teacher.user_id == User.id)
            .where(GeneralTestAttempt.status == COMPLETED)
        )
        if user is not None and not self._is_admin(user):
            stmt = stmt.where(GeneralTest.created_by_user_id == user.id)
        if request.subject_id:
            stmt = stmt.where(GeneralTest.subject_id == request.subject_id)
        if request.test_id:
            stmt = stmt.where(GeneralTestAttempt.test_id == request.test_id)
        if request.search and request.search.strip():
            like = f"%{request.search.strip()}%"
            stmt = stmt.where(
                or_(
                    student.c.full_name.ilike(like),
                    Teacher.full_name.ilike(like),
                    User.username.ilike(like),
                    Group.name.ilike(like),
                )
            )
        return stmt

    @staticmethod
    def _row(row) -> ResultRow:
        attempt: GeneralTestAttempt = row[0]
        return ResultRow(
            attempt_id=attempt.id,
            test_id=attempt.test_id,
            test_title=row.title,
            subject_name=row.subject_name,
            user_id=attempt.user_id,
            full_name=row.full_name,
            username=row.username,
            group_name=row.group_name,
            user_kind=_user_kind(row.student_id, row.teacher_id),
            total_questions=attempt.total_questions,
            correct_answers=attempt.correct_answers or 0,
            score=attempt.score or 0,
            started_at=attempt.started_at,
            finished_at=attempt.finished_at,
            stop_reason=attempt.stop_reason,
        )

    async def list_results(
        self, session: AsyncSession, request: ResultListRequest, user: User
    ) -> ResultListResponse:
        await self._close_expired(session)
        stmt = self._results_stmt(request, user)
        total = (await session.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
        rows = (
            await session.execute(
                stmt.order_by(GeneralTestAttempt.finished_at.desc(), GeneralTestAttempt.id.desc())
                .offset((request.page - 1) * request.limit)
                .limit(request.limit)
            )
        ).all()
        return ResultListResponse(
            total=total,
            page=request.page,
            limit=request.limit,
            results=[self._row(r) for r in rows],
        )

    async def export_results(self, session: AsyncSession, request: ResultListRequest, user: User) -> bytes:
        from openpyxl import Workbook
        from openpyxl.styles import Font

        from app.core.schemas import TASHKENT_TZ

        await self._close_expired(session)
        rows = (
            await session.execute(
                self._results_stmt(request, user).order_by(
                    GeneralTestSubject.name, GeneralTest.title, GeneralTestAttempt.score.desc()
                )
            )
        ).all()

        def local(dt):
            if dt is None:
                return ""
            return (dt + TASHKENT_TZ.utcoffset(None)).strftime("%d.%m.%Y %H:%M")

        wb = Workbook()
        sheet = wb.active
        sheet.title = "Natijalar"
        headers = ["№", "Fan", "Test", "F.I.SH", "Login", "Guruh", "Savollar", "To'g'ri", "Foiz", "Yakunlangan", "To'xtatilgan"]
        sheet.append(headers)
        for cell in sheet[1]:
            cell.font = Font(bold=True)
        for number, raw in enumerate(rows, 1):
            r = self._row(raw)
            sheet.append(
                [
                    number,
                    r.subject_name,
                    r.test_title,
                    r.full_name,
                    r.username or "",
                    r.group_name or "",
                    r.total_questions,
                    r.correct_answers,
                    r.score,
                    local(raw[0].finished_at),
                    r.stop_reason or "",
                ]
            )
        for column, width in zip("ABCDEFGHIJK", (6, 25, 35, 35, 16, 18, 10, 10, 8, 18, 22)):
            sheet.column_dimensions[column].width = width

        buffer = io.BytesIO()
        wb.save(buffer)
        return buffer.getvalue()

    async def delete_result(self, session: AsyncSession, attempt_id: int, user: User) -> None:
        """Удаление попытки возвращает пользователю одну попытку.

        Oʻz testining natijasigina oʻchiriladi. `delete:general_test_result`
        ruxsati qoʻlda ham berilishi mumkin (serverda oʻqituvchida u
        allaqachon bor edi), shuning uchun cheklov ruxsatga emas, egalikka
        tayanadi: aks holda begona testning urinishini oʻchirib boʻlardi va
        uni qaytarib boʻlmasdi.
        """
        attempt = await session.get(GeneralTestAttempt, attempt_id)
        if attempt is None:
            raise _not_found("Natija")
        await self._get_test(session, attempt.test_id, user)
        await session.delete(attempt)
        await session.commit()


get_general_test_repository = GeneralTestRepository()
