"""Сценарии административного API HEMIS: проверка токена и привязка групп.

Сам импорт студентов живёт в `student_sync.py`; здесь только то, что не
пишет в `students`.
"""

import json
import logging
import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis_client import redis_client
from app.modules.organization_structure.model import Group

from . import data_credentials
from .data_client import HemisDataClient, HemisDataError
from .group_match import build_proposals
from .schemas import (
    GroupMatchApplyRequest,
    GroupMatchApplyResponse,
    GroupMatchPreviewResponse,
    GroupMatchProposal,
    HemisDataProbeResponse,
)

logger = logging.getLogger(__name__)

#: Предложения замораживаются между preview и apply — как в EduPlan-синке.
#: Час: администратору хватает разобрать список, а устаревшие решения
#: применять нельзя.
RUN_TTL_SECONDS = 60 * 60


def _run_key(run_id: str) -> str:
    return f"hemis:group-match:{run_id}"


class HemisDataService:
    async def _client(self, session: AsyncSession) -> HemisDataClient:
        url, token = await data_credentials.effective(session)
        return HemisDataClient(url, token)

    async def probe(self, session: AsyncSession) -> HemisDataProbeResponse:
        """Проверка токена: жив ли и сколько активных студентов отдаёт."""
        try:
            client = await self._client(session)
            result = await client.probe()
        except HemisDataError as error:
            return HemisDataProbeResponse(ok=False, detail=str(error.detail))

        await data_credentials.mark_ok(session)
        return HemisDataProbeResponse(ok=True, total=result["total"])

    async def group_match_preview(self, session: AsyncSession) -> GroupMatchPreviewResponse:
        """Полный обход HEMIS и предложения по привязке групп.

        Ничего не пишет: результат кладётся в Redis под `run_id`, а применяет
        его отдельный вызов — так администратор видит цифры до изменений.
        """
        client = await self._client(session)
        items = await client.fetch_all()
        await data_credentials.mark_ok(session)

        proposals = await build_proposals(session, items)
        total_local = len((await session.execute(select(Group.id))).scalars().all())

        run_id = uuid.uuid4().hex
        payload = [p.model_dump() for p in proposals]
        try:
            await redis_client.set(_run_key(run_id), json.dumps(payload), ex=RUN_TTL_SECONDS)
        except Exception:  # noqa: BLE001 — Redis yiqilsa ham preview ko'rsatiladi
            logger.warning("HEMIS: guruh takliflarini Redis'ga yozib bo'lmadi", exc_info=True)

        by_kind = {
            kind: [p for p in proposals if p.kind == kind]
            for kind in ("auto", "review", "unmatched", "already")
        }
        return GroupMatchPreviewResponse(
            run_id=run_id,
            hemis_total_students=len(items),
            hemis_groups=len(proposals),
            local_groups=total_local,
            auto_count=len(by_kind["auto"]),
            review_count=len(by_kind["review"]),
            unmatched_count=len(by_kind["unmatched"]),
            already_count=len(by_kind["already"]),
            students_without_group=sum(
                p.student_count for p in by_kind["review"] + by_kind["unmatched"]
            ),
            proposals=proposals,
        )

    async def group_match_apply(
        self, session: AsyncSession, data: GroupMatchApplyRequest
    ) -> GroupMatchApplyResponse:
        raw = await redis_client.get(_run_key(data.run_id))
        if not raw:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Taklif muddati tugagan — qaytadan preview qiling",
            )
        proposals = [GroupMatchProposal(**item) for item in json.loads(raw)]

        # Ручные решения перекрывают автоматические: администратор видел список.
        decisions = {d.hemis_group_id: d.group_id for d in data.decisions}

        pairs: dict[int, int] = {}
        for proposal in proposals:
            if proposal.hemis_group_id in decisions:
                chosen = decisions[proposal.hemis_group_id]
                if chosen:
                    pairs[proposal.hemis_group_id] = chosen
            elif data.apply_auto and proposal.kind == "auto" and proposal.group_id:
                pairs[proposal.hemis_group_id] = proposal.group_id

        if not pairs:
            return GroupMatchApplyResponse()

        groups = {
            g.id: g
            for g in (
                await session.execute(select(Group).where(Group.id.in_(set(pairs.values()))))
            )
            .scalars()
            .all()
        }
        taken = {
            str(g.hemis_group_id): g.id
            for g in (await session.execute(select(Group).where(Group.hemis_group_id.is_not(None))))
            .scalars()
            .all()
        }

        linked = skipped = 0
        conflicts: list[str] = []
        for hemis_id, group_id in pairs.items():
            group = groups.get(group_id)
            if group is None:
                skipped += 1
                continue

            owner = taken.get(str(hemis_id))
            if owner is not None and owner != group_id:
                # Один и тот же идентификатор HEMIS на двух наших группах —
                # это ошибка сопоставления, а не мелочь: студенты уехали бы
                # в чужую группу. Пропускаем и показываем администратору.
                conflicts.append(
                    f"HEMIS {hemis_id} allaqachon boshqa guruhga bog'langan (id {owner})"
                )
                skipped += 1
                continue

            if str(group.hemis_group_id or "") == str(hemis_id):
                skipped += 1
                continue

            group.hemis_group_id = str(hemis_id)
            # Помечаем происхождение связки: администратор разбирал её здесь,
            # и следующий прогон EduPlan не должен переписать её своим
            # `hemis_id` (см. `eduplan/repository.py::upsert_group`).
            group.hemis_group_id_source = "manual"
            taken[str(hemis_id)] = group_id
            linked += 1

        await session.commit()
        return GroupMatchApplyResponse(linked=linked, skipped=skipped, conflicts=conflicts)


hemis_data_service = HemisDataService()
