import logging

from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.auth.user.model import User
from app.modules.quiz.result.model import Result
from app.modules.quiz.result.repository import get_result_repository
from app.modules.quiz.user_answers.model import UserAnswers

from .schemas import UserAnswersListRequest, UserAnswersListResponse

logger = logging.getLogger(__name__)


class UserAnswersRepository:
    async def get_all(
        self, session: AsyncSession, data: UserAnswersListRequest, current_user: User
    ) -> UserAnswersListResponse:
        stmt = select(UserAnswers).options(
            selectinload(UserAnswers.question),
        )

        filters = []

        # Раньше здесь не было ни одного условия от текущего пользователя: все
        # фильтры приходили из query-строки, поэтому `?user_id=<чужой>` отдавал
        # чужие ответы вместе с correct_answer — во время экзамена это готовый
        # ключ. Видимость определяем той же областью, что и у Result: чьи
        # попытки можно смотреть, того и ответы.
        scope = await get_result_repository.scope_filter(session, current_user)
        if scope is not None:
            visible_results = select(Result.id).where(scope)
            filters.append(UserAnswers.result_id.in_(visible_results))
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
