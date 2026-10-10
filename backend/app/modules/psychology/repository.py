from __future__ import annotations

import logging

from fastapi import HTTPException, status
from sqlalchemy import desc, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.utils.data_scope import DataScope
from app.modules.auth.model import Student, User
from app.modules.organization_structure.model import Faculty, Group
from app.modules.psychology.model import (
    PsychologyMethod,
    PsychologyQuestion,
    PsychologyResult,
)

from .schemas import (
    MethodCreateRequest,
    MethodListRequest,
    MethodListResponse,
    MethodUpdateRequest,
    QuestionCreateRequest,
    QuestionUpdateRequest,
    ResultFilterFaculty,
    ResultFilterGroup,
    ResultFilterOptionsResponse,
    TestResultListRequest,
    TestResultListResponse,
    TestSubmitRequest,
)
from .scoring import compute_diagnosis

logger = logging.getLogger(__name__)

# Natijadagi foydalanuvchi: talaba boʻlsa guruhi, fakulteti va yoʻnalishi
# bilan — `TestResultUserInfo` shulardan toʻldiriladi.
_USER_INFO = selectinload(PsychologyResult.user).options(
    selectinload(User.student).selectinload(Student.group).options(
        selectinload(Group.faculty), selectinload(Group.speciality)
    ),
    selectinload(User.teacher),
)


class PsychologyRepository:
    # ── Method ────────────────────────────────────────────────────────────────

    async def create_method(self, session: AsyncSession, data: MethodCreateRequest) -> PsychologyMethod:
        method = PsychologyMethod(
            name=data.name,
            description=data.description,
            instruction=data.instruction,
        )
        session.add(method)
        try:
            await session.commit()
            await session.refresh(method)
        except IntegrityError:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Bunday nomdagi metod allaqachon mavjud: '{data.name}'",
            )
        except Exception as e:
            await session.rollback()
            logger.error(f"Error creating psychology method: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database error: {str(e)}",
            )
        return await self.get_method(session=session, method_id=method.id)

    async def get_method(self, session: AsyncSession, method_id: int) -> PsychologyMethod:
        stmt = (
            select(PsychologyMethod)
            .options(selectinload(PsychologyMethod.questions))
            .where(PsychologyMethod.id == method_id)
        )
        result = await session.execute(stmt)
        method = result.scalar_one_or_none()
        if not method:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Psychology method not found",
            )
        return method

    async def list_methods(self, session: AsyncSession, request: MethodListRequest) -> MethodListResponse:
        stmt = (
            select(PsychologyMethod)
            .options(selectinload(PsychologyMethod.questions))
            .order_by(desc(PsychologyMethod.created_at))
            .offset(request.offset)
            .limit(request.limit)
        )
        result = await session.execute(stmt)
        methods = result.scalars().all()

        count_stmt = select(func.count()).select_from(PsychologyMethod)
        total = (await session.execute(count_stmt)).scalar() or 0

        return MethodListResponse(
            total=total,
            page=request.page,
            limit=request.limit,
            methods=list(methods),
        )

    async def update_method(self, session: AsyncSession, method_id: int, data: MethodUpdateRequest) -> PsychologyMethod:
        method = await self.get_method(session=session, method_id=method_id)

        if data.name is not None:
            method.name = data.name
        if data.description is not None:
            method.description = data.description
        if data.instruction is not None:
            method.instruction = data.instruction

        try:
            await session.commit()
            await session.refresh(method)
        except IntegrityError:
            await session.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Bunday nomdagi metod allaqachon mavjud: '{data.name}'",
            )
        except Exception as e:
            await session.rollback()
            logger.error(f"Error updating psychology method: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database error: {str(e)}",
            )
        return method

    async def delete_method(self, session: AsyncSession, method_id: int) -> None:
        method = await self.get_method(session=session, method_id=method_id)
        await session.delete(method)
        await session.commit()

    # ── Question ──────────────────────────────────────────────────────────────

    async def create_question(self, session: AsyncSession, data: QuestionCreateRequest) -> PsychologyQuestion:
        # Verify method exists
        await self.get_method(session=session, method_id=data.method_id)

        question = PsychologyQuestion(
            method_id=data.method_id,
            question_type=data.question_type,
            content=data.content,
            options=data.options,
            order=data.order,
            category=(data.category or None) if data.category != "" else None,
        )
        session.add(question)
        try:
            await session.commit()
            await session.refresh(question)
        except Exception as e:
            await session.rollback()
            logger.error(f"Error creating psychology question: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database error: {str(e)}",
            )
        return question

    async def get_question(self, session: AsyncSession, question_id: int) -> PsychologyQuestion:
        stmt = select(PsychologyQuestion).where(PsychologyQuestion.id == question_id)
        result = await session.execute(stmt)
        question = result.scalar_one_or_none()
        if not question:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Psychology question not found",
            )
        return question

    async def update_question(
        self, session: AsyncSession, question_id: int, data: QuestionUpdateRequest
    ) -> PsychologyQuestion:
        question = await self.get_question(session=session, question_id=question_id)

        if data.question_type is not None:
            question.question_type = data.question_type
        if data.content is not None:
            question.content = data.content
        if data.options is not None:
            question.options = data.options
        if data.order is not None:
            question.order = data.order
        if data.category is not None:
            question.category = data.category or None

        try:
            await session.commit()
            await session.refresh(question)
        except Exception as e:
            await session.rollback()
            logger.error(f"Error updating psychology question: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database error: {str(e)}",
            )
        return question

    async def delete_question(self, session: AsyncSession, question_id: int) -> None:
        question = await self.get_question(session=session, question_id=question_id)
        await session.delete(question)
        await session.commit()

    # ── Test / Result ──────────────────────────────────────────────────────────

    async def submit_test(
        self,
        session: AsyncSession,
        method_id: int,
        user_id: int,
        data: TestSubmitRequest,
    ) -> PsychologyResult:
        # Load method (with questions) for diagnosis computation
        method = await self.get_method(session=session, method_id=method_id)
        diagnosis = compute_diagnosis(method, data.answers)

        result = PsychologyResult(
            method_id=method_id,
            user_id=user_id,
            answers=[a.model_dump() for a in data.answers],
            diagnosis=diagnosis,
        )
        session.add(result)
        try:
            await session.commit()
            await session.refresh(result)
        except Exception as e:
            await session.rollback()
            logger.error(f"Error submitting psychology test: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Database error: {str(e)}",
            )
        return await self.get_result(session=session, result_id=result.id)

    async def delete_result(self, session: AsyncSession, result_id: int) -> None:
        result = await self.get_result(session=session, result_id=result_id)
        await session.delete(result)
        await session.commit()

    async def get_result(self, session: AsyncSession, result_id: int) -> PsychologyResult:
        stmt = (
            select(PsychologyResult)
            .options(
                selectinload(PsychologyResult.method).selectinload(PsychologyMethod.questions),
                _USER_INFO,
            )
            .where(PsychologyResult.id == result_id)
        )
        result = (await session.execute(stmt)).scalar_one_or_none()
        if not result:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Result not found")
        return result

    async def list_results(
        self,
        session: AsyncSession,
        request: TestResultListRequest,
        user_id: int | None = None,
        scope: DataScope | None = None,
    ) -> TestResultListResponse:
        stmt = (
            select(PsychologyResult)
            .options(
                selectinload(PsychologyResult.method).selectinload(PsychologyMethod.questions),
                _USER_INFO,
            )
            .order_by(desc(PsychologyResult.created_at))
        )
        count_stmt = select(func.count()).select_from(PsychologyResult)

        def scoped(query):
            if request.method_id:
                query = query.where(PsychologyResult.method_id == request.method_id)
            if request.user_id:
                query = query.where(PsychologyResult.user_id == request.user_id)
            elif user_id:
                query = query.where(PsychologyResult.user_id == user_id)
            if scope is not None and not scope.unrestricted:
                # Oʻziniki + doiradagi guruhlar talabalariniki. Subquery orqali:
                # quyidagi qidiruv va filtr birlashmalariga bogʻliq emas.
                query = query.where(
                    or_(
                        PsychologyResult.user_id == scope.user_id,
                        PsychologyResult.user_id.in_(
                            select(Student.user_id).where(Student.group_id.in_(scope.visible_group_ids))
                        ),
                    )
                )

            search = (request.search or "").strip()
            if search:
                # Talaba boʻlmagan foydalanuvchi ham login boʻyicha topilsin —
                # shuning uchun tashqi birlashma.
                pattern = f"%{search}%"
                query = (
                    query.join(User, User.id == PsychologyResult.user_id)
                    .outerjoin(Student, Student.user_id == User.id)
                    .where(
                        or_(
                            User.username.ilike(pattern),
                            Student.full_name.ilike(pattern),
                            Student.student_id_number.ilike(pattern),
                        )
                    )
                )
                if request.faculty_id or request.group_id or request.course:
                    query = query.join(Group, Group.id == Student.group_id)
            elif request.faculty_id or request.group_id or request.course:
                query = query.join(Student, Student.user_id == PsychologyResult.user_id).join(
                    Group, Group.id == Student.group_id
                )

            if request.faculty_id:
                query = query.where(Group.faculty_id == request.faculty_id)
            if request.group_id:
                query = query.where(Group.id == request.group_id)
            if request.course:
                query = query.where(Group.course == request.course)
            return query

        stmt = scoped(stmt)
        count_stmt = scoped(count_stmt)

        stmt = stmt.offset(request.offset).limit(request.limit)

        results = (await session.execute(stmt)).scalars().all()
        total = (await session.execute(count_stmt)).scalar() or 0

        return TestResultListResponse(
            total=total,
            page=request.page,
            limit=request.limit,
            results=list(results),
        )

    async def result_filter_options(
        self, session: AsyncSession, group_ids: frozenset[int] | None = None
    ) -> ResultFilterOptionsResponse:
        """Natijasi bor fakultet va guruhlar.

        Fakultet va guruh roʻyxatlari `read:faculty` / `read:group` ruxsatini
        talab qiladi, natijalarni koʻradigan psixolog va oʻqituvchida esa ular
        boʻlmasligi mumkin — filtr umuman koʻrinmay qolardi. Bundan tashqari
        bu yerda faqat natija topshirgan guruhlar: boʻsh variantlar keraksiz.
        """
        stmt = (
            select(Group.id, Group.name, Group.course, Faculty.id, Faculty.name)
            .join(Faculty, Faculty.id == Group.faculty_id)
            .where(
                Group.id.in_(
                    select(Student.group_id)
                    .join(PsychologyResult, PsychologyResult.user_id == Student.user_id)
                    .where(Student.group_id.is_not(None))
                )
            )
            .order_by(Faculty.name, Group.name)
        )
        # Koʻrish doirasi: dekanga boshqa fakultetlar variant sifatida ham chiqmasin.
        if group_ids is not None:
            stmt = stmt.where(Group.id.in_(group_ids))
        rows = (await session.execute(stmt)).all()
        faculties: dict[int, ResultFilterFaculty] = {}
        groups = []
        for group_id, group_name, course, faculty_id, faculty_name in rows:
            faculties.setdefault(faculty_id, ResultFilterFaculty(id=faculty_id, name=faculty_name))
            groups.append(ResultFilterGroup(id=group_id, name=group_name, faculty_id=faculty_id, course=course))
        return ResultFilterOptionsResponse(faculties=list(faculties.values()), groups=groups)


get_psychology_repository = PsychologyRepository()
