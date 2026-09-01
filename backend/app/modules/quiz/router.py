import logging

from core.database.db_helper import db_helper
from core.dependencies.role_checker import PermissionRequired
from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from fastapi_limiter.depends import RateLimiter
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.schemas import VisibilityRequest
from app.core.utils.visibility import set_hidden
from app.modules.auth.model import User

from .model import Result
from .question.repository import get_question_repository
from .question.schemas import (
    QuestionBulkDeleteRequest,
    QuestionCatalogResponse,
    QuestionCreateRequest,
    QuestionCreateResponse,
    QuestionExcelUploadResponse,
    QuestionListRequest,
    QuestionListResponse,
)
from .public_quiz.router import router as public_quiz_router
from .quiz.repository import get_quiz_repository
from .quiz.schemas import (
    AvailableQuestionsResponse,
    QuizAnalyticsResponse,
    QuizCatalogResponse,
    QuizCreateRequest,
    QuizCreateResponse,
    QuizListRequest,
    QuizListResponse,
)
from .quiz_process.repository import get_quiz_process_repository
from .quiz_process.schemas import (
    EndQuizRequest,
    EndQuizResponse,
    StartQuizRequest,
    StartQuizResponse,
    SubmitAnswerRequest,
    SubmitAnswerResponse,
    UploadCheatingImageRequest,
    UploadCheatingImageResponse,
)
from .result.repository import get_result_repository
from .result.schemas import (
    ResultListRequest,
    ResultListResponse,
    ResultResponse,
)
from .subject.repository import get_subject_repository
from .subject.schemas import (
    SubjectCreateRequest,
    SubjectCreateResponse,
    SubjectListRequest,
    SubjectListResponse,
)
from .user_answers.repository import user_answers_repository
from .user_answers.schemas import UserAnswersListRequest

logger = logging.getLogger(__name__)


# ============================================================================
#  SUBJECT
# ============================================================================
subject_router = APIRouter(
    tags=["Subject"],
    prefix="/subject",
)


@subject_router.post(
    "/",
    response_model=SubjectCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def create_subject(
    data: SubjectCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("create:subject")),
):
    result = await get_subject_repository.create_subject(session=session, data=data)
    return result


@subject_router.get("/{subject_id}", response_model=SubjectCreateResponse)
async def get_subject(
    subject_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:subject")),
):
    return await get_subject_repository.get_subject(session=session, subject_id=subject_id)


@subject_router.get("/", response_model=SubjectListResponse)
async def list_subjects(
    data: SubjectListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("read:subject")),
):
    return await get_subject_repository.list_subjects(session=session, request=data, current_user=current_user)


@subject_router.put(
    "/{subject_id}",
    response_model=SubjectCreateResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def update_subject(
    subject_id: int,
    data: SubjectCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:subject")),
):
    result = await get_subject_repository.update_subject(session=session, subject_id=subject_id, data=data)
    return result


@subject_router.delete(
    "/{subject_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def delete_subject(
    subject_id: int,
    force: bool = False,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:subject")),
):
    await get_subject_repository.delete_subject(session=session, subject_id=subject_id, force=force)


# ============================================================================
#  QUESTION
# ============================================================================
question_router = APIRouter(
    tags=["Question"],
    prefix="/question",
)


@question_router.get("/download_excel")
async def download_questions_excel(
    subject_id: int | None = Query(None),
    user_id: int | None = Query(None),
    text: str | None = Query(None),
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:question")),
):
    import io

    excel_bytes = await get_question_repository.download_questions_excel(
        session=session,
        subject_id=subject_id,
        user_id=user_id,
        text=text,
    )

    filename = "savollar.xlsx"
    if subject_id:
        filename = f"savollar_fan_{subject_id}.xlsx"

    return StreamingResponse(
        io.BytesIO(excel_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@question_router.post(
    "/",
    response_model=QuestionCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def create_question(
    data: QuestionCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("create:question")),
):
    result = await get_question_repository.create_question(
        session=session, data=data, current_user=current_user
    )
    return result


@question_router.get("/catalog", response_model=QuestionCatalogResponse)
async def get_question_catalog(
    search: str | None = None,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("read:question")),
):
    return await get_question_repository.get_catalog(session=session, current_user=current_user, search=search)


@question_router.get("/{question_id}", response_model=QuestionCreateResponse)
async def get_question(
    question_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("read:question")),
):
    return await get_question_repository.get_question(
        session=session, question_id=question_id, current_user=current_user
    )


@question_router.get("/", response_model=QuestionListResponse)
async def list_questions(
    data: QuestionListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("read:question")),
):
    return await get_question_repository.list_questions(session=session, request=data, current_user=current_user)


@question_router.put(
    "/{question_id}",
    response_model=QuestionCreateResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def update_question(
    question_id: int,
    data: QuestionCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("update:question")),
):
    result = await get_question_repository.update_question(
        session=session, question_id=question_id, data=data, current_user=current_user
    )
    return result


@question_router.delete(
    "/{question_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def delete_question(
    question_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("delete:question")),
):
    await get_question_repository.delete_question(session=session, question_id=question_id, current_user=current_user)


@question_router.delete(
    "/bulk/subject-user",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def bulk_delete_questions(
    data: QuestionBulkDeleteRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("delete:question")),
):
    return await get_question_repository.bulk_delete_questions(session=session, data=data, current_user=current_user)


@question_router.post(
    "/upload_image",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def upload_question_image(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("create:question")),
):
    url = await get_question_repository.upload_image(
        session=session, file=file, current_user=current_user
    )
    return {"url": url}


@question_router.post(
    "/upload_excel",
    response_model=QuestionExcelUploadResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def upload_questions_excel(
    subject_id: int,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: PermissionRequired = Depends(PermissionRequired("create:question")),
):
    result = await get_question_repository.upload_questions_excel(
        session=session, file=file, subject_id=subject_id, user_id=current_user.id
    )
    return result


# ============================================================================
#  QUIZ
# ============================================================================
quiz_router = APIRouter(
    tags=["Quiz"],
    prefix="/quiz",
)


@quiz_router.post(
    "/",
    response_model=QuizCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def create_quiz(
    data: QuizCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("create:quiz")),
):
    # Создателя берём из токена, а не из тела запроса: иначе организатор мог бы
    # записать создание теста на чужое имя.
    result = await get_quiz_repository.create_quiz(
        session=session,
        data=data,
        created_by_user_id=current_user.id,
    )
    return result


@quiz_router.get("/available-questions", response_model=AvailableQuestionsResponse)
async def get_available_questions(
    lecturer_id: int,
    subject_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: User = Depends(PermissionRequired("create:quiz")),
):
    """Сколько вопросов лектора доступно для сборки теста.

    Отдаёт только количество — ни текстов, ни вариантов: организатор собирает тест,
    но содержимое банка вопросов ему не принадлежит и видеть его он не должен.
    """
    available = await get_quiz_repository.count_available_questions(
        session=session,
        lecturer_id=lecturer_id,
        subject_id=subject_id,
    )
    return AvailableQuestionsResponse(lecturer_id=lecturer_id, subject_id=subject_id, available=available)


@quiz_router.get("/active", response_model=QuizListResponse)
async def list_active_quizzes(
    data: QuizListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("read:active_quiz")),
):
    data.is_active = True
    return await get_quiz_repository.list_quizzes(session=session, request=data, current_user=current_user)


@quiz_router.get("/catalog", response_model=QuizCatalogResponse)
async def get_quiz_catalog(
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("read:quiz")),
):
    return await get_quiz_repository.get_catalog(session=session, current_user=current_user)


@quiz_router.get("/{quiz_id}", response_model=QuizCreateResponse)
async def get_quiz(
    quiz_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:quiz")),
):
    return await get_quiz_repository.get_quiz(session=session, quiz_id=quiz_id)


@quiz_router.get("/{quiz_id}/analytics", response_model=QuizAnalyticsResponse)
async def get_quiz_analytics(
    quiz_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:result")),
):
    return await get_quiz_repository.get_analytics(session=session, quiz_id=quiz_id)


@quiz_router.get("/", response_model=QuizListResponse)
async def list_quizzes(
    data: QuizListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("read:quiz")),
):
    return await get_quiz_repository.list_quizzes(session=session, request=data, current_user=current_user)


@quiz_router.put(
    "/{quiz_id}",
    response_model=QuizCreateResponse,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def update_quiz(
    quiz_id: int,
    data: QuizCreateRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("update:quiz")),
):
    result = await get_quiz_repository.update_quiz(session=session, quiz_id=quiz_id, data=data)
    return result


@quiz_router.delete(
    "/{quiz_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def delete_quiz(
    quiz_id: int,
    force: bool = False,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:quiz")),
):
    await get_quiz_repository.delete_quiz(session=session, quiz_id=quiz_id, force=force)


@quiz_router.get("/{quiz_id}/delete-info")
async def get_quiz_delete_info(
    quiz_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:quiz")),
):
    """Returns counts of related data that will be deleted along with the quiz."""
    result_count = (
        await session.execute(select(func.count()).select_from(Result).where(Result.quiz_id == quiz_id))
    ).scalar() or 0
    return {"results_count": result_count}


@quiz_router.post(
    "/{quiz_id}/repeat",
    response_model=QuizCreateResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def repeat_quiz(
    quiz_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("create:quiz")),
):
    result = await get_quiz_repository.repeat_quiz(
        session=session,
        quiz_id=quiz_id,
        created_by_user_id=current_user.id,
    )
    return result


@quiz_router.post(
    "/upload",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def upload_quiz_image(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("create:quiz")),
):
    url = await get_quiz_repository.upload_image(
        session=session, file=file, current_user=current_user
    )
    return {"url": url}


# ============================================================================
#  QUIZ PROCESS
# ============================================================================
quiz_process_router = APIRouter(
    tags=["Quiz Process"],
    prefix="/quiz_process",
)


@quiz_process_router.post(
    "/start_quiz",
    response_model=StartQuizResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def start_quiz(
    data: StartQuizRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("quiz_process:start_quiz")),
):
    return await get_quiz_process_repository.start_quiz(session=session, data=data, user=current_user)


@quiz_process_router.post(
    "/submit_answer",
    response_model=SubmitAnswerResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(RateLimiter(times=60, seconds=60))],
)
async def submit_answer(
    data: SubmitAnswerRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("quiz_process:submit_answer")),
):
    return await get_quiz_process_repository.submit_answer(session=session, data=data, user=current_user)


@quiz_process_router.post(
    "/end_quiz",
    response_model=EndQuizResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def end_quiz(
    data: EndQuizRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("quiz_process:end_quiz")),
):
    return await get_quiz_process_repository.end_quiz(session=session, data=data, user=current_user)


@quiz_process_router.post(
    "/upload_cheating_evidence",
    response_model=UploadCheatingImageResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def upload_cheating_evidence(
    data: UploadCheatingImageRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("quiz_process:end_quiz")),
):
    return await get_quiz_process_repository.upload_cheating_evidence(session=session, data=data, user=current_user)


# ============================================================================
#  RESULT
# ============================================================================
result_router = APIRouter(
    tags=["Result"],
    prefix="/result",
)


@result_router.get("/{result_id}", response_model=ResultResponse)
async def get_result(
    result_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("read:result")),
):
    return await get_result_repository.get_result(session=session, result_id=result_id)


@result_router.get("/", response_model=ResultListResponse)
async def list_results(
    data: ResultListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("read:result")),
):
    return await get_result_repository.list_results(session=session, request=data, current_user=current_user)


@result_router.delete(
    "/{result_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(RateLimiter(times=5, seconds=60))],
)
async def delete_result(
    result_id: int,
    session: AsyncSession = Depends(db_helper.session_getter),
    _: PermissionRequired = Depends(PermissionRequired("delete:result")),
):
    await get_result_repository.delete_result(session=session, result_id=result_id)


# ============================================================================
#  USER ANSWERS
# ============================================================================
user_answers_router = APIRouter(
    prefix="/user_answers",
    tags=["User Answers"],
)


@user_answers_router.get("/")
async def get_user_answers(
    data: UserAnswersListRequest = Depends(),
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("user_answers:read")),
):
    # current_user, а не `_`: студенту репозиторий сузит выборку до его ответов.
    return await user_answers_repository.get_all(session, data, current_user)


# ============================================================================
#  AGGREGATE ROUTER
# ============================================================================
router = APIRouter()
@subject_router.patch("/{subject_id}/visibility", status_code=status.HTTP_200_OK)
async def set_subject_visibility(
    subject_id: int,
    data: VisibilityRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
    current_user: User = Depends(PermissionRequired("update:subject")),
):
    """Fanni boshqa rollardan yashiradi yoki qaytaradi. Faqat admin.

    Yashirilgan fan yangi test yoki kurs yaratishda taklif qilinmaydi, lekin
    undagi savollar va eski natijalar joyida qoladi.
    """
    from app.modules.quiz.model import Subject

    row = await set_hidden(session, Subject, subject_id, data.is_hidden, current_user, "Fan")
    return {"id": row.id, "is_hidden": row.is_hidden}


router.include_router(subject_router)
router.include_router(question_router)
router.include_router(quiz_router)
router.include_router(quiz_process_router)
router.include_router(result_router)
router.include_router(user_answers_router)
# Ochiq test: autentifikatsiyasiz endpointlar alohida modulda.
router.include_router(public_quiz_router)
