"""Test topshirish: boshlash, yuz tekshiruvi, javoblar, qat'iy rejim, yakunlash."""

from __future__ import annotations

import base64
import binascii
import logging
import random
from datetime import datetime

import httpx

from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.mixins.time_stamp_mixin import utcnow_naive
from app.core.redis_client import redis_client
from app.core.security import create_face_ws_token
from app.core.utils.face_service import FACE_ENTRY_MESSAGES, FACE_ENTRY_TTL_SECONDS, classify, verify_face
from app.modules.auth.model import Student, User
from app.modules.quiz.quiz_process import errors as quiz_errors
from app.modules.quiz.quiz_process import strict
from app.modules.quiz.quiz_process.schemas import VerifyEntryFaceResponse

from .model import (
    GeneralTest,
    GeneralTestAnswer,
    GeneralTestAttempt,
    GeneralTestQuestion,
)
from .schemas import (
    AnswerRequest,
    AttemptResult,
    AttemptState,
    AvailableTest,
    AvailableTestListResponse,
    CheatingRequest,
    HeartbeatResponse,
    LeaveRequest,
    TakeOption,
    TakeQuestion,
    GeneralTestVerifyEntryFaceRequest,
)
from app.core.errors import Conflict, Forbidden, Invalid
from app.core.config import settings as app_settings
from .common import LETTERS, IN_PROGRESS, COMPLETED, STRICT_KIND, CHEATING_REASONS, FACE_GRANT_TTL_SECONDS, _face_entry_key, _face_grant_key, _deadline, _remaining_seconds, _is_expired, _visible_to, _per_attempt
from .errors import _not_found, _closed_left_page, _question_deleted

logger = logging.getLogger(__name__)



class AttemptsMixin:
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
                    proctoring_mode=test.proctoring_mode,
                )
            )
        return AvailableTestListResponse(tests=result)

    async def _state(self, session: AsyncSession, attempt: GeneralTestAttempt) -> AttemptState:
        face_ws_token = image_url = None
        if attempt.test.proctoring_mode == "face" and attempt.user_id is not None:
            image_url = await self._reference_photo(session, attempt.user_id)
            # Token yuz xizmatining WebSocket'i uchun; xizmat faqat imzoni
            # tekshiradi, `quiz_id` maydoni bu yerda elementar test id si.
            face_ws_token = create_face_ws_token(
                user_id=attempt.user_id,
                quiz_id=attempt.test_id,
                ttl_minutes=max(1, _remaining_seconds(attempt, attempt.test) // 60 + 5),
            )
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
            hold_to_reveal=attempt.test.hold_to_reveal,
            proctoring_mode=attempt.test.proctoring_mode,
            no_face_finish_seconds=(
                attempt.test.no_face_finish_seconds if attempt.test.proctoring_mode == "face" else None
            ),
            face_ws_token=face_ws_token,
            image_url=image_url,
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
                # Kirishda yuz — har bir kirishda, qaytishda ham (oddiy testdagi kabi).
                entry_key = await self._require_face(session, test, user)
                await self._grant_face(entry_key, attempt.id)
                return await self._state(session, attempt)
            await self._finalize(session, attempt)

        pool = await self._admit(session, test, user, pin, len(own))
        entry_key = await self._require_face(session, test, user)

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
        await self._grant_face(entry_key, attempt.id)
        return await self._state(session, attempt)

    async def _admit(
        self, session: AsyncSession, test: GeneralTest, user: User, pin: str | None, used_attempts: int
    ) -> list[int]:
        """Yangi urinishga ruxsat: ko'rinish, faollik, PIN, urinishlar soni, savollar.

        Rad etishdan oldin commit — `start` dagi advisory lock bo'shasin.
        Savollar havzasini qaytaradi.
        """
        visible = (
            await session.execute(select(GeneralTest.id).where(GeneralTest.id == test.id, _visible_to(user.id)))
        ).scalar_one_or_none()
        # Biriktirilmagan foydalanuvchi uchun test yo'qdek: id ni terib kirib
        # bo'lmasin.
        if visible is None:
            await session.commit()
            raise _not_found()
        if not test.is_active:
            await session.commit()
            raise Invalid("quiz_not_active", "Test faol emas")
        # PIN — только для новой попытки: вернуться в начатую можно без него.
        if test.pin is not None and (pin or "").strip() != test.pin:
            await session.commit()
            raise Forbidden("invalid_pin", "PIN kod noto'g'ri")
        if used_attempts >= test.attempt_limit:
            await session.commit()
            raise Invalid("general_test_attempts_exhausted", "Urinishlar soni tugagan")

        # Savollar fanning bankidan — shu fanning barcha testlari uchun bitta.
        pool = (
            (await session.execute(select(GeneralTestQuestion.id).where(GeneralTestQuestion.subject_id == test.subject_id)))
            .scalars()
            .all()
        )
        if not pool:
            await session.commit()
            raise Invalid("quiz_has_no_questions", "Bu fanda savollar yo'q")
        return list(pool)

    # ── Yuz nazorati ─────────────────────────────────────────────────────────

    @staticmethod
    async def _reference_photo(session: AsyncSession, user_id: int | None) -> str | None:
        """Etalon surat: talabada — faqat HEMIS surati, xodimda — profil surati.

        Talabaning o'zi yuklagan surat etalon bo'lmaydi: aks holda o'rniga
        test yechadigan odamning suratini yuklab qo'yish mumkin edi.
        Elementar testni xodimlar ham yechadi — ularda `Student` yo'q, faqat
        profil surati bo'lishi mumkin.
        """
        if user_id is None:
            return None
        row = (
            await session.execute(
                select(User.avatar_path, Student.id.label("student_id"), Student.image_path)
                .outerjoin(Student, Student.user_id == User.id)
                .where(User.id == user_id)
                .order_by(Student.id.desc().nulls_last())
                .limit(1)
            )
        ).first()
        if row is None:
            return None
        if row.student_id is not None:
            return (row.image_path or "").strip() or None
        return (row.avatar_path or "").strip() or None

    async def _require_face(self, session: AsyncSession, test: GeneralTest, user: User) -> str | None:
        """Kamera rejimidagi testga kirish shartlari; `face_entry` tasdiq kalitini qaytaradi.

        Suratsiz foydalanuvchi qo'yilmaydi — solishtiradigan narsa yo'q, nazorat
        esa jimgina o'chib qolardi. Istisno — admin: u testni ko'rib chiqadi.
        Tasdiqni server qo'yadi (`verify_entry_face`), brauzerga ishonilmaydi.
        """
        if test.proctoring_mode == "standard":
            return None
        if await self._reference_photo(session, user.id) is None:
            if self._is_admin(user):
                return None
            await session.commit()
            raise quiz_errors.student_photo_missing()
        if test.proctoring_mode != "face_entry":
            return None
        key = _face_entry_key(user.id, test.id)
        if not await redis_client.exists(key):
            await session.commit()
            raise quiz_errors.face_verification_required()
        return key

    @staticmethod
    async def _grant_face(entry_key: str | None, attempt_id: int) -> None:
        """Tasdiq bir martalik: kirish kaliti o'chadi, test sahifasi qisqa vaqt ochiq."""
        if entry_key is None:
            return
        await redis_client.delete(entry_key)
        await redis_client.set(_face_grant_key(attempt_id), "1", ex=FACE_GRANT_TTL_SECONDS)

    async def verify_entry_face(
        self, session: AsyncSession, test_id: int, data: GeneralTestVerifyEntryFaceRequest, user: User
    ) -> VerifyEntryFaceResponse:
        """`face_entry` testiga kirishdan oldin yuzni etalon surat bilan solishtiradi.

        Qayta urinishlar cheklanmaydi (faqat so'rov tezligi): yomon yorug'lik
        talabaning aybi emas. Tugamagan urinishga qaytishda PIN va faollik
        so'ralmaydi — `start` ham so'ramaydi.
        """
        test = await self._get_test(session, test_id)
        if test.proctoring_mode != "face_entry":
            raise quiz_errors.face_entry_not_required()

        own = (
            (
                await session.execute(
                    select(GeneralTestAttempt).where(
                        GeneralTestAttempt.test_id == test_id, GeneralTestAttempt.user_id == user.id
                    )
                )
            )
            .scalars()
            .all()
        )
        resuming = any(a.status == IN_PROGRESS and not _is_expired(a, test) for a in own)
        if not resuming:
            await self._admit(session, test, user, data.pin, len(own))

        key = _face_entry_key(user.id, test.id)
        reference = await self._reference_photo(session, user.id)
        if reference is None:
            if not self._is_admin(user):
                raise quiz_errors.student_photo_missing()
            await redis_client.set(key, "1", ex=FACE_ENTRY_TTL_SECONDS)
            return VerifyEntryFaceResponse(verified=True, status="ok", message=FACE_ENTRY_MESSAGES["ok"])

        try:
            result = await verify_face(data.image_base64, reference)
        except (httpx.HTTPError, ValueError) as cause:
            logger.warning("Face service unavailable for general test %s entry: %s", test.id, cause)
            raise quiz_errors.face_service_unavailable() from cause

        check_status = classify(result)
        verified = check_status == "ok"
        if verified:
            await redis_client.set(key, "1", ex=FACE_ENTRY_TTL_SECONDS)
        else:
            logger.info("General test face entry rejected: user=%s test=%s status=%s", user.id, test.id, check_status)
        return VerifyEntryFaceResponse(
            verified=verified, status=check_status, message=FACE_ENTRY_MESSAGES[check_status]
        )

    @staticmethod
    def _save_evidence(image_data: str | None, test_id: int, user_id: int) -> str | None:
        """Qoidabuzarlik kadrini saqlaydi; buzuq yoki bo'sh kadr — `None` (belgi baribir qoladi)."""
        if not image_data:
            return None

        raw = image_data.split(",", 1)[1] if "," in image_data else image_data
        try:
            image_bytes = base64.b64decode(raw, validate=True)
        except (binascii.Error, ValueError):
            return None
        evidence_dir = app_settings.evidence_dir
        evidence_dir.mkdir(parents=True, exist_ok=True)
        filename = f"gtest_{test_id}_user_{user_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
        (evidence_dir / filename).write_bytes(image_bytes)
        # /uploads/cheating_evidence/ — main.py dagi StaticFiles (oddiy test bilan bir joy).
        return f"/uploads/cheating_evidence/{filename}"

    async def report_cheating(
        self, session: AsyncSession, attempt_id: int, data: CheatingRequest, user: User
    ) -> AttemptResult:
        """`face` rejimi: brauzer qoidabuzarlikni aytdi — urinish dalil bilan yopiladi."""
        attempt = await self._own_attempt(session, attempt_id, user)
        if attempt.status != IN_PROGRESS:
            return self._result(attempt)
        if attempt.test.proctoring_mode != "face":
            raise Invalid("general_test_no_camera_control", "Bu testda kamera nazorati yo'q")
        if data.kind == "no_face" and not attempt.test.no_face_finish_seconds:
            # Sozlama o'chiq — brauzer yuz yo'qligi uchun yopmasligi kerak edi.
            raise Invalid("general_test_no_face_finish_disabled", "Bu testda yuz ko'rinmasa yakunlash yoqilmagan")
        attempt.cheating_image_url = self._save_evidence(data.image_data, attempt.test_id, user.id)
        attempt.stop_reason = CHEATING_REASONS[data.kind]
        await self._finalize(session, attempt)
        await session.commit()
        await strict.forget(attempt.id, STRICT_KIND)
        return self._result(attempt)

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
            raise Conflict("attempt_already_finished", "Urinish yakunlangan")
        if _is_expired(attempt, attempt.test):
            await self._finalize(session, attempt)
            await session.commit()
            raise Conflict("attempt_expired", "Vaqt tugagan")
        # Test sahifasi urinishni shu yerdan oladi: ikkinchi ochilish — sahifa
        # yangilangan yoki «Davom ettirish» bosilgan, ya'ni talaba chiqqan.
        if attempt.test.strict_mode:
            ttl = _remaining_seconds(attempt, attempt.test) + 3600
            if not await strict.first_open(attempt.id, STRICT_KIND, ttl) and not await self._strict_young(
                session, attempt
            ):
                await self._close_left(session, attempt, "resume")
            await self._require_alive(session, attempt)
        # Kirishda yuz: sahifa faqat yaqinda tasdiqlangan kirishdan keyin ochiladi.
        # To'g'ridan-to'g'ri havola yoki keyinroq yangilash — yana yuz.
        if attempt.test.proctoring_mode == "face_entry" and not await redis_client.exists(_face_grant_key(attempt.id)):
            if await self._reference_photo(session, user.id) is not None or not self._is_admin(user):
                await session.commit()
                raise quiz_errors.face_verification_required()
        return await self._state(session, attempt)

    async def answer(self, session: AsyncSession, attempt_id: int, data: AnswerRequest, user: User) -> None:
        attempt = await self._own_attempt(session, attempt_id, user)
        if attempt.status != IN_PROGRESS:
            raise Conflict("attempt_already_finished", "Urinish yakunlangan")
        if _is_expired(attempt, attempt.test):
            await self._finalize(session, attempt)
            await session.commit()
            raise Conflict("attempt_expired", "Vaqt tugagan")
        await self._require_alive(session, attempt)
        if data.question_id not in {item["q"] for item in attempt.layout}:
            raise Invalid("question_not_in_attempt", "Savol bu urinishga tegishli emas")
        if await session.get(GeneralTestQuestion, data.question_id) is None:
            raise _question_deleted()

        stmt = pg_insert(GeneralTestAnswer).values(
            attempt_id=attempt.id,
            question_id=data.question_id,
            selected_option=data.option,
            created_at=utcnow_naive(),
            updated_at=utcnow_naive(),
        )
        try:
            await session.execute(
                stmt.on_conflict_do_update(
                    constraint="uq_general_test_answer",
                    set_={"selected_option": stmt.excluded.selected_option, "updated_at": stmt.excluded.updated_at},
                )
            )
            await session.commit()
        except IntegrityError as cause:
            # Tekshiruv bilan yozish orasida o'chirildi — 500 emas, aniq javob.
            await session.rollback()
            raise _question_deleted() from cause

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
            cheating_image_url=attempt.cheating_image_url,
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
            raise Invalid("strict_mode_disabled", "Bu testda qat'iy rejim yoqilmagan")
        attempt.stop_reason = strict.leave_reason_text(data.reason)
        await self._finalize(session, attempt)
        await session.commit()
        await strict.forget(attempt.id, STRICT_KIND)
        return self._result(attempt)

    async def heartbeat(self, session: AsyncSession, attempt_id: int, user: User) -> HeartbeatResponse:
        """Sahifa ochiq. Muddati o'tgan heartbeat'ni tiriltirmaydi (`quiz_process` dagi kabi)."""
        attempt = await self._own_attempt(session, attempt_id, user)
        if attempt.status != IN_PROGRESS:
            raise Conflict("attempt_already_finished", "Urinish yakunlangan")
        if attempt.test.strict_mode:
            await self._require_alive(session, attempt)
            await strict.touch(attempt.id, STRICT_KIND)
        # FOR UPDATE qulfini bo'shatadi.
        await session.commit()
        return HeartbeatResponse()
