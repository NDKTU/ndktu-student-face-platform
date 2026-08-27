import logging

from sqlalchemy import and_, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.quiz.model import Result, UserAnswers

from .schemas import UserAnswersListRequest, UserAnswersListResponse

logger = logging.getLogger(__name__)


class UserAnswersRepository:
    @staticmethod
    async def _attempt_filters(session: AsyncSession, result_id: int) -> list:
        """Фильтры для одной попытки.

        Обычный случай: у ответов проставлен ``result_id`` — фильтруем по нему.

        Но ``result_id`` появился позже самих ответов, и у всех записей, залитых
        из старых дампов, он пуст. По строгому фильтру такая попытка отдавала бы
        пустой список, хотя ответы есть — экран разбора показывал «Javoblar
        topilmadi», а тот же URL без ``result_id`` открывался нормально.

        Для таких записей возвращаемся к паре (user_id, quiz_id) самой попытки и
        дополнительно сужаем окном ``created_at .. finished_at``: без него у
        студента, проходившего тест дважды, в одну попытку попали бы ответы
        обеих.
        """
        linked = await session.scalar(
            select(func.count()).select_from(UserAnswers).where(UserAnswers.result_id == result_id)
        )
        if linked:
            return [UserAnswers.result_id == result_id]

        attempt = await session.get(Result, result_id)
        if attempt is None:
            # Попытки нет — пусть ответ будет пустым, а не «все ответы подряд».
            return [UserAnswers.result_id == result_id]

        legacy = []
        if attempt.user_id is not None:
            legacy.append(UserAnswers.user_id == attempt.user_id)
        if attempt.quiz_id is not None:
            legacy.append(UserAnswers.quiz_id == attempt.quiz_id)
        if attempt.finished_at is not None:
            legacy.append(UserAnswers.created_at.between(attempt.created_at, attempt.finished_at))
        if not legacy:
            return [UserAnswers.result_id == result_id]
        logger.info("Попытка %s без result_id у ответов — отбор по (user_id, quiz_id) и окну времени", result_id)
        return legacy

    async def get_all(self, session: AsyncSession, data: UserAnswersListRequest) -> UserAnswersListResponse:
        stmt = select(UserAnswers).options(
            selectinload(UserAnswers.question),
        )

        filters = []
        if data.result_id is not None:
            filters.extend(await self._attempt_filters(session, data.result_id))
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
