"""Testlar va ularga biriktirilgan guruhlar."""

from __future__ import annotations



from sqlalchemy import delete, func, literal, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.utils.proctoring import resolve_no_face_finish
from app.modules.auth.model import User
from app.modules.organization_structure.model import Group

from .model import (
    GeneralTest,
    GeneralTestAttempt,
    GeneralTestGroup,
    GeneralTestQuestion,
    GeneralTestSubject,
)
from .schemas import (
    GeneralTestCreateRequest,
    GeneralTestDetail,
    GeneralTestListResponse,
    GeneralTestSummary,
    GeneralTestUpdateRequest,
    TestGroup,
    TestGroupsAddRequest,
    TestGroupUpdateRequest,
)
from .common import COMPLETED, _new_pin, _compose_title
from .errors import _not_found


class GeneralTestsMixin:
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
        self, session: AsyncSession, test_id: int, user: User | None = None, *, view: bool = False
    ) -> GeneralTest:
        """`view=True` — faqat koʻrish: butun universitetni koʻradigan rolga ham ochiq."""
        stmt = select(GeneralTest).options(selectinload(GeneralTest.subject)).where(GeneralTest.id == test_id)
        test = (await session.execute(stmt)).scalar_one_or_none()
        if test is None:
            raise _not_found()
        if user is not None and not (view and await self._sees_all(session, user)):
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

    def _with_counts(self, test: GeneralTest, counts, user: User) -> GeneralTestSummary:
        """Ro'yxat/kartochka qatori.

        PIN — faqat egasi va adminga: butun universitetni koʻradigan rol
        testni koʻradi, lekin PIN'ni talabalarga tarqatib yubora olmasligi kerak.
        """
        questions, attempts, groups = counts
        can_manage = self._is_admin(user) or test.created_by_user_id == user.id
        return GeneralTestSummary.model_validate(test).model_copy(
            update={
                "question_count": questions.get(test.id, 0),
                "attempt_count": attempts.get(test.id, 0),
                "group_count": groups.get(test.id, 0),
                "can_manage": can_manage,
                "pin_required": test.pin is not None,
                "pin": test.pin if can_manage else None,
            }
        )

    async def _summary(self, session: AsyncSession, test: GeneralTest, user: User) -> GeneralTestSummary:
        return self._with_counts(test, await self._counts(session, [test.id]), user)

    async def list_tests(
        self,
        session: AsyncSession,
        page: int,
        limit: int,
        search: str | None,
        user: User,
        subject_id: int | None = None,
    ) -> GeneralTestListResponse:
        stmt = await self._own_only(
            session, select(GeneralTest).options(selectinload(GeneralTest.subject)), GeneralTest, user
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
            tests=[self._with_counts(t, counts, user) for t in tests],
        )

    async def get_test(self, session: AsyncSession, test_id: int, user: User) -> GeneralTestDetail:
        test = await self._get_test(session, test_id, user, view=True)
        summary = await self._summary(session, test, user)
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
        no_face = await resolve_no_face_finish(
            session, user, current=None, requested=data.no_face_finish_seconds, proctoring_mode=data.proctoring_mode
        )
        test = GeneralTest(
            **data.model_dump(exclude={"group_ids", "pin_required", "no_face_finish_seconds"}),
            no_face_finish_seconds=no_face,
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
        for flag in ("strict_mode", "hold_to_reveal", "proctoring_mode"):
            if flag in changes and changes[flag] is None:
                changes.pop(flag)
        # Ruxsat va kamera rejimiga bog'liq — oddiy maydonlardan alohida.
        requested_no_face = changes.pop("no_face_finish_seconds", None)
        test.no_face_finish_seconds = await resolve_no_face_finish(
            session,
            user,
            current=test.no_face_finish_seconds,
            requested=requested_no_face,
            proctoring_mode=changes.get("proctoring_mode", test.proctoring_mode),
        )
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
