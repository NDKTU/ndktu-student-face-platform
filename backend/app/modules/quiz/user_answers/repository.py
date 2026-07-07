import logging

from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.quiz.model import UserAnswers

from .schemas import UserAnswersListRequest, UserAnswersListResponse

logger = logging.getLogger(__name__)


class UserAnswersRepository:
    async def get_all(self, session: AsyncSession, data: UserAnswersListRequest) -> UserAnswersListResponse:
        stmt = select(UserAnswers).options(
            selectinload(UserAnswers.question),
        )

        filters = []
        if data.result_id is not None:
            # Strict path: a specific attempt was requested — scope to its UserAnswers only.
            filters.append(UserAnswers.result_id == data.result_id)
        else:
            # Legacy path: callers that only know (user_id, quiz_id) get all rows,
            # including historical entries written before result_id existed.
            if data.user_id is not None:
                filters.append(UserAnswers.user_id == data.user_id)
            if data.quiz_id is not None:
                filters.append(UserAnswers.quiz_id == data.quiz_id)
        if data.question_id is not None:
            filters.append(UserAnswers.question_id == data.question_id)

        if filters:
            stmt = stmt.where(and_(*filters))

        # Count total
        count_stmt = select(func.count()).select_from(UserAnswers)
        if filters:
            count_stmt = count_stmt.where(and_(*filters))
        total_result = await session.execute(count_stmt)
        total = total_result.scalar() or 0

        stmt = stmt.order_by(desc(UserAnswers.created_at))
        stmt = stmt.offset(data.offset).limit(data.limit)

        result = await session.execute(stmt)
        answers = result.scalars().all()

        return UserAnswersListResponse(
            total=total,
            page=data.page,
            limit=data.limit,
            answers=answers,
        )


user_answers_repository = UserAnswersRepository()
