from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utils.data_scope import DataScope
from app.modules.psychology.model import (
    PsychologyMethod,
    PsychologyQuestion,
    PsychologyResult,
)

from .repository import get_psychology_repository
from .schemas import (
    MethodCreateRequest,
    MethodListRequest,
    MethodListResponse,
    MethodUpdateRequest,
    QuestionCreateRequest,
    QuestionUpdateRequest,
    TestResultListRequest,
    ResultFilterOptionsResponse,
    TestResultListResponse,
    TestSubmitRequest,
)


class PsychologyService:
    async def create_method(self, session: AsyncSession, data: MethodCreateRequest) -> PsychologyMethod:
        return await get_psychology_repository.create_method(session=session, data=data)

    async def get_method(self, session: AsyncSession, method_id: int) -> PsychologyMethod:
        return await get_psychology_repository.get_method(session=session, method_id=method_id)

    async def list_methods(self, session: AsyncSession, request: MethodListRequest) -> MethodListResponse:
        return await get_psychology_repository.list_methods(session=session, request=request)

    async def update_method(self, session: AsyncSession, method_id: int, data: MethodUpdateRequest) -> PsychologyMethod:
        return await get_psychology_repository.update_method(session=session, method_id=method_id, data=data)

    async def delete_method(self, session: AsyncSession, method_id: int) -> None:
        await get_psychology_repository.delete_method(session=session, method_id=method_id)

    async def create_question(self, session: AsyncSession, data: QuestionCreateRequest) -> PsychologyQuestion:
        return await get_psychology_repository.create_question(session=session, data=data)

    async def get_question(self, session: AsyncSession, question_id: int) -> PsychologyQuestion:
        return await get_psychology_repository.get_question(session=session, question_id=question_id)

    async def update_question(
        self, session: AsyncSession, question_id: int, data: QuestionUpdateRequest
    ) -> PsychologyQuestion:
        return await get_psychology_repository.update_question(session=session, question_id=question_id, data=data)

    async def delete_question(self, session: AsyncSession, question_id: int) -> None:
        await get_psychology_repository.delete_question(session=session, question_id=question_id)

    async def submit_test(
        self,
        session: AsyncSession,
        method_id: int,
        user_id: int,
        data: TestSubmitRequest,
    ) -> PsychologyResult:
        return await get_psychology_repository.submit_test(
            session=session, method_id=method_id, user_id=user_id, data=data
        )

    async def delete_result(self, session: AsyncSession, result_id: int) -> None:
        await get_psychology_repository.delete_result(session=session, result_id=result_id)

    async def get_result(self, session: AsyncSession, result_id: int) -> PsychologyResult:
        return await get_psychology_repository.get_result(session=session, result_id=result_id)

    async def list_results(
        self,
        session: AsyncSession,
        request: TestResultListRequest,
        user_id: int | None = None,
        scope: DataScope | None = None,
    ) -> TestResultListResponse:
        return await get_psychology_repository.list_results(
            session=session, request=request, user_id=user_id, scope=scope
        )


    async def result_filter_options(
        self, session: AsyncSession, group_ids: frozenset[int] | None = None
    ) -> ResultFilterOptionsResponse:
        return await get_psychology_repository.result_filter_options(session=session, group_ids=group_ids)


get_psychology_service = PsychologyService()
