"""Двухфазная синхронизация с EduPlan: предпросмотр, затем применение.

Почему две фазы, а не одна. Локально уже накоплены 5 факультетов, 21 кафедра,
206 групп, 754 предмета и 346 сотрудников — без ``external_id``. Прямой импорт
создал бы их дубликаты и оторвал 3408 студентов и всю историю результатов от
новых строк. Поэтому прогон сначала показывает, что именно он собирается
сделать, администратор разбирает неоднозначные совпадения, и только потом
изменения применяются.

Предложения замораживаются в Redis: применение работает ровно с тем состоянием,
которое видел администратор, а не с тем, что стало на той стороне минуту спустя.
"""

import json
import logging
import uuid
from typing import Any, Iterable

from core.mixins.time_stamp_mixin import utcnow_naive
from core.redis_client import redis_client
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import Employee
from app.modules.organization_structure.model import (
    Department,
    Faculty,
    Group,
    Kafedra,
    Speciality,
)
from app.modules.quiz.model import Subject

from .client import EduPlanClient
from .repository import eduplan_repository, normalize_name
from .schemas import (
    SYNC_ORDER,
    ApplyRequest,
    ApplyResponse,
    ApplyResult,
    Candidate,
    Decision,
    EduPlanDepartment,
    EduPlanEntity,
    EduPlanFaculty,
    EduPlanGroup,
    EduPlanSection,
    EduPlanSpeciality,
    EduPlanStaff,
    EduPlanSubject,
    EntitySummary,
    PreviewResponse,
    Proposal,
    ProposalAction,
)

logger = logging.getLogger(__name__)

#: Снимок живёт час — столько администратору хватает на разбор конфликтов,
#: и при этом применение не работает с безнадёжно устаревшими данными.
SNAPSHOT_TTL_SECONDS = 3600

#: Модель и человекочитаемое имя для каждой зеркалируемой сущности.
ENTITY_MODEL = {
    EduPlanEntity.faculty: Faculty,
    EduPlanEntity.kafedra: Kafedra,
    EduPlanEntity.department: Department,
    EduPlanEntity.speciality: Speciality,
    EduPlanEntity.group: Group,
    EduPlanEntity.subject: Subject,
    EduPlanEntity.employee: Employee,
}


def _snapshot_key(run_id: str) -> str:
    return f"eduplan:sync:{run_id}"


class EduPlanSyncService:
    # ------------------------------------------------------------------ #
    #  Фаза 1: предпросмотр
    # ------------------------------------------------------------------ #
    async def build_preview(self, session: AsyncSession) -> PreviewResponse:
        async with EduPlanClient() as client:
            snapshot = {
                "faculties": await client.faculties(),
                "departments": await client.departments(),
                "sections": await client.sections(),
                "specialities": await client.specialities(),
                "groups": await client.groups(),
                "subjects": await client.subjects(),
                "staff": await client.staff(),
            }

        proposals = await self._build_proposals(session, snapshot)

        run_id = str(uuid.uuid4())
        # Замораживаем именно предложения: в них уже разложены все поля, которые
        # применение будет записывать. Хранить сверх этого сырой ответ EduPlan
        # незачем — apply к нему не обращается.
        await redis_client.set(
            _snapshot_key(run_id),
            json.dumps(
                {"proposals": [p.model_dump(mode="json") for p in proposals]},
                ensure_ascii=False,
            ),
            ex=SNAPSHOT_TTL_SECONDS,
        )

        summary = self._summarize(snapshot, proposals)
        requires_decision = sum(1 for p in proposals if p.action == ProposalAction.conflict)

        logger.info(
            "EduPlan preview %s: %d предложений, %d требуют решения",
            run_id,
            len(proposals),
            requires_decision,
        )

        return PreviewResponse(
            run_id=run_id,
            generated_at=utcnow_naive().isoformat(),
            summary=summary,
            proposals=proposals,
            requires_decision=requires_decision,
        )

    # ------------------------------------------------------------------ #
    #  Сопоставление
    # ------------------------------------------------------------------ #
    @staticmethod
    def _match(
        name: str,
        unclaimed: Iterable[Any],
        name_of=lambda row: row.name,
    ) -> list[Any]:
        """Локальные кандидаты на совпадение по нормализованному имени."""
        target = normalize_name(name)
        return [row for row in unclaimed if normalize_name(name_of(row)) == target]

    @staticmethod
    def _decide(
        entity: EduPlanEntity,
        external_id: str,
        external_name: str,
        linked: dict[str, Any],
        candidates: list[Any],
        changes: dict[str, Any],
        name_of=lambda row: row.name,
    ) -> Proposal:
        if external_id in linked:
            row = linked[external_id]
            action = ProposalAction.update if changes else ProposalAction.unchanged
            return Proposal(
                entity=entity,
                action=action,
                external_id=external_id,
                external_name=external_name,
                local_id=row.id,
                changes=changes,
            )

        if len(candidates) == 1:
            return Proposal(
                entity=entity,
                action=ProposalAction.link,
                external_id=external_id,
                external_name=external_name,
                local_id=candidates[0].id,
                changes=changes,
            )

        if len(candidates) > 1:
            return Proposal(
                entity=entity,
                action=ProposalAction.conflict,
                external_id=external_id,
                external_name=external_name,
                candidates=[Candidate(id=c.id, name=str(name_of(c))) for c in candidates],
                changes=changes,
                note="Несколько локальных строк подходят по названию — выберите нужную",
            )

        return Proposal(
            entity=entity,
            action=ProposalAction.create,
            external_id=external_id,
            external_name=external_name,
            changes=changes,
        )

    async def _build_proposals(self, session: AsyncSession, snapshot: dict[str, list[dict]]) -> list[Proposal]:
        proposals: list[Proposal] = []

        for entity in SYNC_ORDER:
            model = ENTITY_MODEL[entity]
            linked = await eduplan_repository.index_by_external(session, model)

            if entity == EduPlanEntity.employee:
                local_rows = await eduplan_repository.load_employees(session)
            else:
                local_rows = await eduplan_repository.load_all(session, model)

            # Кандидатами могут быть только строки, ещё никем не занятые:
            # заведённые вручную либо не связанные с EduPlan.
            unclaimed = [r for r in local_rows if r.external_source is None]

            external = self._external_items(entity, snapshot)
            seen: set[str] = set()

            for external_id, name, changes, name_of in external:
                seen.add(external_id)
                candidates = self._match(name, unclaimed, name_of)
                proposals.append(self._decide(entity, external_id, name, linked, candidates, changes, name_of))

            # Было в зеркале, пропало на той стороне.
            for external_id, row in linked.items():
                if external_id not in seen and row.is_active:
                    proposals.append(
                        Proposal(
                            entity=entity,
                            action=ProposalAction.deactivate,
                            external_id=external_id,
                            external_name=self._display_name(entity, row),
                            local_id=row.id,
                            note="Отсутствует в EduPlan — будет помечена неактивной, не удалена",
                        )
                    )

        return proposals

    @staticmethod
    def _display_name(entity: EduPlanEntity, row) -> str:
        return row.full_name if entity == EduPlanEntity.employee else row.name

    @staticmethod
    def _external_items(entity: EduPlanEntity, snapshot: dict[str, list[dict]]):
        """(external_id, имя, поля для записи, как достать имя у локальной строки)."""
        by_name = lambda row: row.name  # noqa: E731

        if entity == EduPlanEntity.faculty:
            for raw in snapshot["faculties"]:
                f = EduPlanFaculty.model_validate(raw)
                yield str(f.id), f.name, {"name": f.name}, by_name

        elif entity == EduPlanEntity.kafedra:
            for raw in snapshot["departments"]:
                d = EduPlanDepartment.model_validate(raw)
                yield str(d.id), d.name, {"name": d.name, "faculty_external_id": str(d.faculty_id)}, by_name

        elif entity == EduPlanEntity.department:
            for raw in snapshot["sections"]:
                s = EduPlanSection.model_validate(raw)
                yield str(s.id), s.name, {"name": s.name}, by_name

        elif entity == EduPlanEntity.speciality:
            for raw in snapshot["specialities"]:
                sp = EduPlanSpeciality.model_validate(raw)
                yield (
                    str(sp.id),
                    sp.name,
                    {
                        "name": sp.name,
                        "kafedra_external_id": str(sp.department_id),
                        "education_type": sp.education_type,
                    },
                    by_name,
                )

        elif entity == EduPlanEntity.group:
            for raw in snapshot["groups"]:
                g = EduPlanGroup.model_validate(raw)
                yield (
                    str(g.id),
                    g.name,
                    {
                        "name": g.name,
                        "speciality_external_id": str(g.speciality_id),
                        "course": g.course,
                        "education_shape": g.education_shape,
                        "student_count": g.student_count,
                    },
                    by_name,
                )

        elif entity == EduPlanEntity.subject:
            for raw in snapshot["subjects"]:
                s = EduPlanSubject.model_validate(raw)
                yield (
                    str(s.id),
                    s.name,
                    {
                        "name": s.name,
                        "kafedra_external_id": str(s.department_id),
                        "credits": s.credits,
                    },
                    by_name,
                )

        elif entity == EduPlanEntity.employee:
            for raw in snapshot["staff"]:
                st = EduPlanStaff.model_validate(raw)
                profile = st.teacher
                yield (
                    str(st.id),
                    st.full_name or st.username,
                    {
                        "username": st.username,
                        "hemis_id": st.hemis_id,
                        "first_name": st.first_name or "",
                        "last_name": st.last_name or "",
                        "third_name": st.third_name or "",
                        "full_name": st.full_name,
                        "position": profile.position if profile else None,
                        "staff_type": profile.staff_type if profile else None,
                        "is_teacher": profile is not None,
                        "kafedra_external_id": (
                            str(profile.department_id) if profile and profile.department_id else None
                        ),
                    },
                    lambda row: row.full_name,
                )

    @staticmethod
    def _summarize(snapshot: dict[str, list[dict]], proposals: list[Proposal]) -> list[EntitySummary]:
        source_key = {
            EduPlanEntity.faculty: "faculties",
            EduPlanEntity.kafedra: "departments",
            EduPlanEntity.department: "sections",
            EduPlanEntity.speciality: "specialities",
            EduPlanEntity.group: "groups",
            EduPlanEntity.subject: "subjects",
            EduPlanEntity.employee: "staff",
        }
        summary = []
        for entity in SYNC_ORDER:
            item = EntitySummary(
                entity=entity,
                total_external=len(snapshot.get(source_key[entity], [])),
            )
            for p in proposals:
                if p.entity == entity:
                    setattr(item, p.action.value, getattr(item, p.action.value) + 1)
            summary.append(item)
        return summary

    # ------------------------------------------------------------------ #
    #  Фаза 2: применение
    # ------------------------------------------------------------------ #
    async def apply(self, session: AsyncSession, request: ApplyRequest) -> ApplyResponse:
        raw = await redis_client.get(_snapshot_key(request.run_id))
        if not raw:
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail="Снимок предпросмотра истёк или не найден. Запустите предпросмотр заново.",
            )

        stored = json.loads(raw)
        proposals = [Proposal.model_validate(p) for p in stored["proposals"]]
        decisions: dict[str, Decision] = {d.key: d for d in request.decisions}

        # external_id -> локальный id, по сущностям. Заполняется как уже
        # связанными строками, так и созданными в этом прогоне: ребёнок
        # разрешает родителя именно отсюда.
        id_map: dict[EduPlanEntity, dict[str, int]] = {}
        for entity in SYNC_ORDER:
            linked = await eduplan_repository.index_by_external(session, ENTITY_MODEL[entity])
            id_map[entity] = {ext_id: row.id for ext_id, row in linked.items()}

        # Локальная кафедра -> локальный факультет, чтобы вывести факультет
        # группы: в EduPlan у группы есть только специальность.
        kafedra_faculty: dict[int, int] = {
            k.id: k.faculty_id for k in await eduplan_repository.load_all(session, Kafedra)
        }
        speciality_kafedra: dict[int, int] = {
            s.id: s.kafedra_id for s in await eduplan_repository.load_all(session, Speciality)
        }

        results: dict[EduPlanEntity, ApplyResult] = {entity: ApplyResult(entity=entity) for entity in SYNC_ORDER}

        try:
            for entity in SYNC_ORDER:
                for proposal in (p for p in proposals if p.entity == entity):
                    await self._apply_one(
                        session=session,
                        proposal=proposal,
                        decision=decisions.get(proposal.key),
                        request=request,
                        id_map=id_map,
                        kafedra_faculty=kafedra_faculty,
                        speciality_kafedra=speciality_kafedra,
                        result=results[entity],
                    )
            await session.commit()
        except Exception:
            await session.rollback()
            logger.exception("EduPlan apply %s провалился, изменения откачены", request.run_id)
            raise

        logger.info("EduPlan apply %s завершён", request.run_id)
        return ApplyResponse(
            run_id=request.run_id,
            results=list(results.values()),
            finished_at=utcnow_naive().isoformat(),
        )

    async def _apply_one(
        self,
        *,
        session: AsyncSession,
        proposal: Proposal,
        decision: Decision | None,
        request: ApplyRequest,
        id_map: dict[EduPlanEntity, dict[str, int]],
        kafedra_faculty: dict[int, int],
        speciality_kafedra: dict[int, int],
        result: ApplyResult,
    ) -> None:
        entity = proposal.entity
        action = decision.action if decision else proposal.action
        local_id = decision.local_id if decision and decision.local_id else proposal.local_id

        if action == ProposalAction.unchanged:
            return

        if action == ProposalAction.conflict:
            # Неразобранный конфликт применять нельзя: связать вслепую значит
            # оторвать студентов и историю результатов от нужной строки.
            result.skipped += 1
            return

        if action == ProposalAction.deactivate:
            if not request.apply_deactivations or local_id is None:
                result.skipped += 1
                return
            row = await session.get(ENTITY_MODEL[entity], local_id)
            if row is not None:
                await eduplan_repository.deactivate(session, row)
                result.deactivated += 1
            return

        existing = await session.get(ENTITY_MODEL[entity], local_id) if local_id else None
        was_new = existing is None
        changes = proposal.changes

        try:
            if entity == EduPlanEntity.faculty:
                row = await eduplan_repository.upsert_faculty(session, proposal.external_id, changes["name"], existing)

            elif entity == EduPlanEntity.kafedra:
                faculty_id = id_map[EduPlanEntity.faculty].get(changes["faculty_external_id"])
                if faculty_id is None:
                    result.errors.append(f"Кафедра {proposal.external_name}: факультет не разрешён, пропущена")
                    result.skipped += 1
                    return
                row = await eduplan_repository.upsert_kafedra(
                    session, proposal.external_id, changes["name"], faculty_id, existing
                )
                kafedra_faculty[row.id] = faculty_id

            elif entity == EduPlanEntity.department:
                row = await eduplan_repository.upsert_department(
                    session, proposal.external_id, changes["name"], existing
                )

            elif entity == EduPlanEntity.speciality:
                kafedra_id = id_map[EduPlanEntity.kafedra].get(changes["kafedra_external_id"])
                if kafedra_id is None:
                    result.errors.append(f"Специальность {proposal.external_name}: кафедра не разрешена, пропущена")
                    result.skipped += 1
                    return
                row = await eduplan_repository.upsert_speciality(
                    session,
                    proposal.external_id,
                    changes["name"],
                    kafedra_id,
                    changes.get("education_type"),
                    existing,
                )
                speciality_kafedra[row.id] = kafedra_id

            elif entity == EduPlanEntity.group:
                speciality_id = id_map[EduPlanEntity.speciality].get(changes["speciality_external_id"])
                # У группы в EduPlan факультета нет — выводим по цепочке
                # специальность -> кафедра -> факультет.
                faculty_id = None
                if speciality_id is not None:
                    kafedra_id = speciality_kafedra.get(speciality_id)
                    faculty_id = kafedra_faculty.get(kafedra_id) if kafedra_id else None
                if faculty_id is None:
                    result.errors.append(f"Группа {proposal.external_name}: не удалось вывести факультет, пропущена")
                    result.skipped += 1
                    return
                row = await eduplan_repository.upsert_group(
                    session,
                    proposal.external_id,
                    changes["name"],
                    faculty_id,
                    speciality_id,
                    changes.get("course"),
                    changes.get("education_shape"),
                    changes.get("student_count"),
                    existing,
                )

            elif entity == EduPlanEntity.subject:
                kafedra_id = id_map[EduPlanEntity.kafedra].get(changes["kafedra_external_id"])
                row = await eduplan_repository.upsert_subject(
                    session,
                    proposal.external_id,
                    changes["name"],
                    kafedra_id,
                    changes.get("credits"),
                    existing,
                )

            elif entity == EduPlanEntity.employee:
                kafedra_ext = changes.get("kafedra_external_id")
                kafedra_id = id_map[EduPlanEntity.kafedra].get(kafedra_ext) if kafedra_ext else None
                row = await eduplan_repository.upsert_employee(
                    session,
                    external_id=proposal.external_id,
                    username=changes["username"],
                    hemis_id=changes.get("hemis_id"),
                    first_name=changes["first_name"],
                    last_name=changes["last_name"],
                    third_name=changes["third_name"],
                    full_name=changes["full_name"] or changes["username"],
                    position=changes.get("position"),
                    staff_type=changes.get("staff_type"),
                    is_teacher=bool(changes.get("is_teacher")),
                    kafedra_id=kafedra_id,
                    existing=existing,
                )
            else:
                return
        except Exception as e:  # noqa: BLE001 — одна битая строка не должна валить прогон
            logger.warning("EduPlan: %s %r не применена: %s", entity.value, proposal.external_name, e)
            result.errors.append(f"{proposal.external_name}: {e}")
            result.skipped += 1
            return

        id_map[entity][proposal.external_id] = row.id
        if was_new:
            result.created += 1
        elif action == ProposalAction.link:
            result.linked += 1
        else:
            result.updated += 1


eduplan_sync_service = EduPlanSyncService()
