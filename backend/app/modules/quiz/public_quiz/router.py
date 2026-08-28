"""Ochiq test uchun ochiq (autentifikatsiyasiz) endpointlar.

Bu yerdagi hamma narsa tizimga kirmagan odam uchun, shuning uchun:
- faqat `PUBLIC_FREE` turidagi faol testlar ko'rinadi;
- urinish tokeni bitta urinishga bog'langan va boshqa hech qanday huquq
  bermaydi;
- so'rovlar tezligi cheklangan: PIN'ni terib ko'rish qiyin bo'lsin.
"""

from core.database.db_helper import db_helper
from fastapi import APIRouter, Depends, Header
from fastapi_limiter.depends import RateLimiter
from sqlalchemy.ext.asyncio import AsyncSession

from .repository import get_public_quiz_repository
from .schemas import (
    PublicAnswerRequest,
    PublicAnswerResponse,
    PublicFinishResponse,
    PublicStartRequest,
    PublicStartResponse,
)

router = APIRouter(prefix="/public/quiz", tags=["Public Quiz"])


def guest_token(x_guest_token: str = Header(...)) -> str:
    """Mehmon tokeni alohida sarlavhada: `Authorization` platformaning
    sessiya tokeni uchun band va interseptorlar uni almashtirib yuborardi."""
    return x_guest_token


@router.post(
    "/start",
    response_model=PublicStartResponse,
    dependencies=[Depends(RateLimiter(times=10, seconds=60))],
)
async def public_start(
    data: PublicStartRequest,
    session: AsyncSession = Depends(db_helper.session_getter),
):
    return await get_public_quiz_repository.start(session=session, data=data)


@router.post(
    "/answer",
    response_model=PublicAnswerResponse,
    dependencies=[Depends(RateLimiter(times=120, seconds=60))],
)
async def public_answer(
    data: PublicAnswerRequest,
    token: str = Depends(guest_token),
    session: AsyncSession = Depends(db_helper.session_getter),
):
    return await get_public_quiz_repository.answer(session=session, token=token, data=data)


@router.post(
    "/finish",
    response_model=PublicFinishResponse,
    dependencies=[Depends(RateLimiter(times=20, seconds=60))],
)
async def public_finish(
    token: str = Depends(guest_token),
    session: AsyncSession = Depends(db_helper.session_getter),
):
    return await get_public_quiz_repository.finish(session=session, token=token)
