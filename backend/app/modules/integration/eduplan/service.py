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
from typing import Any, Iterable, Sequence

from core.mixins.time_stamp_mixin import utcnow_naive
from core.redis_client import redis_client
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.auth.model import Teacher
from app.modules.organization_structure.model import (
    Curriculum,
    Faculty,
    Group,
    Kafedra,
    Speciality,
)
from app.modules.quiz.model import Subject

from .client import EduPlanClient
from .credentials import effective_config
from .repository import eduplan_repository, normalize_name
from .schemas import (
    ENTITY_DEPENDENCIES,
    SYNC_ORDER,
    ApplyRequest,
    ApplyResponse,
    ApplyResult,
    Candidate,
    Decision,
    EduPlanCurriculum,
    EduPlanDepartment,
    EduPlanEntity,
    EduPlanFaculty,
    EduPlanGroup,
    EduPlanSpeciality,
    EduPlanStaff,
    EduPlanSubject,
    EntitySummary,
    PreviewResponse,
    Proposal,
    ProposalAction,
    SyncFailure,
)

logger = logging.getLogger(__name__)

#: Bir progonda oʻchirilishi mumkin boʻlgan oʻqituvchilarning eng katta
#: ulushi. Oshsa — tasdiqsiz oʻchirilmaydi (`_guard_mass_deletion`).
DELETE_SHARE_THRESHOLD = 0.10

#: Снимок живёт час — столько администратору хватает на разбор конфликтов,
#: и при этом применение не работает с безнадёжно устаревшими данными.
SNAPSHOT_TTL_SECONDS = 3600

#: Модель и человекочитаемое имя для каждой зеркалируемой сущности.
ENTITY_MODEL = {
    EduPlanEntity.faculty: Faculty,
    EduPlanEntity.kafedra: Kafedra,
    EduPlanEntity.speciality: Speciality,
    EduPlanEntity.group: Group,
    EduPlanEntity.subject: Subject,
    EduPlanEntity.teacher: Teacher,
    EduPlanEntity.curriculum: Curriculum,
}


#: Какой ключ снимка какому справочнику соответствует. Один источник правды
#: для чтения из EPMOS и для подсчёта итогов.
ENTITY_SOURCE_KEY: dict[EduPlanEntity, str] = {
    EduPlanEntity.faculty: "faculties",
    EduPlanEntity.kafedra: "departments",
    EduPlanEntity.speciality: "specialities",
    EduPlanEntity.group: "groups",
    EduPlanEntity.subject: "subjects",
    EduPlanEntity.teacher: "staff",
    EduPlanEntity.curriculum: "edu_plans",
}


def _snapshot_key(run_id: str) -> str:
    return f"eduplan:sync:{run_id}"


class EduPlanSyncService:
    # ------------------------------------------------------------------ #
    #  Выбор справочников
    # ------------------------------------------------------------------ #
    @staticmethod
    def _normalize_entities(
        entities: Sequence[EduPlanEntity] | None,
    ) -> tuple[EduPlanEntity, ...]:
        """Убирает дубли и возвращает выбранное в порядке SYNC_ORDER.

        Порядок важен, даже когда справочник один: применение разрешает
        родителя по ``id_map``, и обход не в том порядке дал бы пропуски
        внутри одного прогона, если выбрано сразу несколько разделов.
        """
        if not entities:
            return SYNC_ORDER
        chosen = set(entities)
        return tuple(e for e in SYNC_ORDER if e in chosen)

    @staticmethod
    def _with_dependencies(
        entities: Sequence[EduPlanEntity],
    ) -> tuple[EduPlanEntity, ...]:
        """Выбранное плюс всё, на что оно ссылается, в порядке SYNC_ORDER.

        Зависимости не синхронизируются — они лишь читаются из уже
        сохранённого зеркала, чтобы разрешить ссылку на родителя.
        """
        needed: set[EduPlanEntity] = set()
        queue = list(entities)
        while queue:
            entity = queue.pop()
            if entity in needed:
                continue
            needed.add(entity)
            queue.extend(ENTITY_DEPENDENCIES.get(entity, ()))
        return tuple(e for e in SYNC_ORDER if e in needed)

    @staticmethod
    async def _fetch_snapshot(
        client: EduPlanClient,
        entities: Sequence[EduPlanEntity],
    ) -> dict[str, list[dict]]:
        """Читает из EPMOS только выбранные справочники.

        Каждый обход — это десятки страниц по сети, поэтому лишние не
        запрашиваем: синхронизация одних факультетов должна стоить один
        запрос, а не шесть обходов.
        """
        readers = {
            EduPlanEntity.faculty: client.faculties,
            EduPlanEntity.kafedra: client.departments,
            EduPlanEntity.speciality: client.specialities,
            EduPlanEntity.group: client.groups,
            EduPlanEntity.subject: client.subjects,
            EduPlanEntity.teacher: client.staff,
            EduPlanEntity.curriculum: client.edu_plans,
        }
        snapshot: dict[str, list[dict]] = {}
        for entity in entities:
            snapshot[ENTITY_SOURCE_KEY[entity]] = await readers[entity]()
        return snapshot

    # ------------------------------------------------------------------ #
    #  Фаза 1: предпросмотр
    # ------------------------------------------------------------------ #
    async def build_preview(
        self,
        session: AsyncSession,
        entities: Sequence[EduPlanEntity] | None = None,
    ) -> PreviewResponse:
        """Предпросмотр по выбранным справочникам.

        ``entities=None`` — все, как раньше. Явный список читает из EPMOS
        только нужные разделы: синхронизация одних преподавателей не должна
        тянуть 206 групп и 754 предмета.
        """
        selected = self._normalize_entities(entities)

        async with EduPlanClient(await effective_config(session)) as client:
            snapshot = await self._fetch_snapshot(client, selected)

        proposals = await self._build_proposals(session, snapshot, selected)

        run_id = str(uuid.uuid4())
        # Замораживаем именно предложения: в них уже разложены все поля, которые
        # применение будет записывать. Хранить сверх этого сырой ответ EduPlan
        # незачем — apply к нему не обращается.
        await redis_client.set(
            _snapshot_key(run_id),
            json.dumps(
                {
                    "proposals": [p.model_dump(mode="json") for p in proposals],
                    "entities": [e.value for e in selected],
                },
                ensure_ascii=False,
            ),
            ex=SNAPSHOT_TTL_SECONDS,
        )

        summary = self._summarize(snapshot, proposals, selected)
        requires_decision = sum(1 for p in proposals if p.action == ProposalAction.conflict)

        logger.info(
            "EPMOS preview %s [%s]: %d предложений, %d требуют решения",
            run_id,
            ",".join(e.value for e in selected),
            len(proposals),
            requires_decision,
        )

        return PreviewResponse(
            run_id=run_id,
            generated_at=utcnow_naive().isoformat(),
            entities=list(selected),
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

    #: Поля, которые нельзя сравнить «в лоб» по имени колонки: они пишутся
    #: УСЛОВНО, и прямое сравнение держало бы строку в вечном ``update``.
    #: Для каждого — своя проверка в ``_is_up_to_date``, повторяющая правило
    #: записи. Раньше они просто исключались из сравнения, и это давало
    #: слепое пятно: если в EPMOS менялось ТОЛЬКО такое поле, строка
    #: считалась ``unchanged`` и новое значение не записывалось никогда.
    _CONDITIONAL_FIELDS = frozenset({"hemis_group_id", "username"})

    @staticmethod
    def _hemis_group_id_changed(row: Any, value: Any) -> bool:
        """Повторяет правило ``upsert_group``.

        Пустое значение из EPMOS не затирает известную связку, а связку,
        разобранную вручную, не трогает и непустое. Записью считается
        только то, что действительно будет записано, — иначе такие группы
        попадали бы в ``update`` на каждом прогоне.

        Слепое пятно, которое это закрывает: в EPOS у группы проставили
        ``hemis_id`` и больше ничего не меняли. Без этой проверки связка
        не доезжала, а по ней импорт студентов раскладывает людей по
        группам — вся группа оставалась без студентов.
        """
        incoming = str(value).strip() if value else ""
        if not incoming:
            return False
        if incoming == str(getattr(row, "hemis_group_id", None) or ""):
            return False
        return getattr(row, "hemis_group_id_source", None) != "manual"

    @staticmethod
    def _username_changed(row: Any, value: Any) -> bool:
        """Логин лежит в связанной строке ``users``, а не в ``teachers``.

        Занятый чужим аккаунтом логин ``upsert_teacher`` не записывает, то
        есть такая строка будет в ``update`` каждый прогон. Это осознанно:
        два человека с одним логином — настоящий конфликт, который должен
        быть виден, и теперь он приезжает в ``failures`` с причиной
        ``username_taken``.

        Слепое пятно, которое это закрывает: в EPMOS сменили логин, ФИО
        прежнее — преподаватель не мог войти, потому что у нас оставался
        старый.
        """
        incoming = str(value).strip() if value else ""
        if not incoming:
            return False
        current = getattr(getattr(row, "user", None), "username", None) or ""
        return incoming != current

    @classmethod
    def _is_up_to_date(
        cls,
        row: Any,
        changes: dict[str, Any],
        parent_external: dict[str, dict[int, str]],
    ) -> bool:
        """Строка зеркала уже совпадает с тем, что приехало из EduPlan?

        Консервативно: любое поле, которое не удаётся сравнить уверенно,
        считается изменившимся. Лишний ``update`` — это шум, пропущенный
        ``update`` — это расхождение зеркала с EduPlan, что гораздо хуже.
        """
        # Строка могла быть помечена неактивной прошлым прогоном, а теперь
        # снова приехала: `_stamp` вернёт `is_active = True`, значит это
        # изменение, даже если все поля совпадают.
        if not getattr(row, "is_active", True):
            return False

        for field, value in changes.items():
            if field in cls._CONDITIONAL_FIELDS:
                checker = (
                    cls._hemis_group_id_changed
                    if field == "hemis_group_id"
                    else cls._username_changed
                )
                if checker(row, value):
                    return False
                continue

            if field.endswith("_external_id"):
                # Ссылка на родителя: в снимке — внешний id, в строке —
                # локальный FK. Сверяем через карту «локальный id → внешний».
                local_fk = getattr(row, field.replace("_external_id", "_id"), None)
                current = parent_external.get(field, {}).get(local_fk) if local_fk else None
                if (current or None) != (value or None):
                    return False
                continue

            if getattr(row, field, None) != value:
                return False

        return True

    @classmethod
    def _decide(
        cls,
        entity: EduPlanEntity,
        external_id: str,
        external_name: str,
        linked: dict[str, Any],
        candidates: list[Any],
        changes: dict[str, Any],
        name_of=lambda row: row.name,
        parent_external: dict[str, dict[int, str]] | None = None,
    ) -> Proposal:
        if external_id in linked:
            row = linked[external_id]
            # `changes` — это не diff, а полный набор полей для записи
            # (`_apply_one` читает из него `name`, `*_external_id` и прочее),
            # поэтому он никогда не пуст. Раньше действие выбиралось по нему
            # самому — и `unchanged` не наступал никогда: каждый прогон
            # переписывал весь каталог, а админ не видел, что менялось на
            # самом деле. Теперь сравниваем со строкой зеркала.
            action = (
                ProposalAction.unchanged
                if cls._is_up_to_date(row, changes, parent_external or {})
                else ProposalAction.update
            )
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

    async def _build_proposals(
        self,
        session: AsyncSession,
        snapshot: dict[str, list[dict]],
        entities: Sequence[EduPlanEntity],
    ) -> list[Proposal]:
        proposals: list[Proposal] = []

        # Карта «локальный id родителя → его внешний id»: без неё нельзя
        # понять, изменилась ли привязка (в снимке — внешний id, в строке —
        # локальный FK). Три дешёвых индекса, строятся один раз на прогон.
        parent_external: dict[str, dict[int, str]] = {}
        for field, parent_entity in (
            ("faculty_external_id", EduPlanEntity.faculty),
            ("kafedra_external_id", EduPlanEntity.kafedra),
            ("speciality_external_id", EduPlanEntity.speciality),
        ):
            index = await eduplan_repository.index_by_external(session, ENTITY_MODEL[parent_entity])
            parent_external[field] = {row.id: ext_id for ext_id, row in index.items()}

        for entity in entities:
            model = ENTITY_MODEL[entity]
            linked = await eduplan_repository.index_by_external(
                session,
                model,
                # Логин сравнивается с `row.user.username`: он лежит в
                # связанной строке. Без этого загрузчика ленивая подгрузка
                # в async-сессии падает `MissingGreenlet`.
                options=(selectinload(Teacher.user),) if entity == EduPlanEntity.teacher else (),
            )

            if entity == EduPlanEntity.teacher:
                local_rows = await eduplan_repository.load_teachers(session)
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
                proposals.append(
                    self._decide(
                        entity, external_id, name, linked, candidates, changes, name_of, parent_external
                    )
                )

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
        return row.full_name if entity == EduPlanEntity.teacher else row.name

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
                        "education_language": g.education_language,
                        "hemis_group_id": g.hemis_id,
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
                        "curriculum_external_id": str(s.edu_plan_id) if s.edu_plan_id else None,
                        "semester": s.semester,
                    },
                    by_name,
                )

        elif entity == EduPlanEntity.curriculum:
            for raw in snapshot["edu_plans"]:
                cp = EduPlanCurriculum.model_validate(raw)
                yield (
                    str(cp.id),
                    cp.name,
                    {
                        "name": cp.name,
                        "speciality_external_id": str(cp.speciality_id),
                        "education_form": cp.education_form,
                        "education_type": cp.education_type,
                    },
                    by_name,
                )

        elif entity == EduPlanEntity.teacher:
            for raw in snapshot["staff"]:
                st = EduPlanStaff.model_validate(raw)
                profile = st.teacher
                if profile is None:
                    continue  # o'qituvchi bo'lmagan xodimlar zerkal qilinmaydi
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
                        "kafedra_external_id": (str(profile.department_id) if profile.department_id else None),
                    },
                    lambda row: row.full_name,
                )

    @staticmethod
    def _summarize(
        snapshot: dict[str, list[dict]],
        proposals: list[Proposal],
        entities: Sequence[EduPlanEntity],
    ) -> list[EntitySummary]:
        summary = []
        for entity in entities:
            item = EntitySummary(
                entity=entity,
                total_external=len(snapshot.get(ENTITY_SOURCE_KEY[entity], [])),
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
        # Разделы берём из самого снимка, а не из запроса: применять можно
        # ровно то, что администратор видел в предпросмотре.
        entities = self._normalize_entities(
            [EduPlanEntity(v) for v in stored.get("entities", [])] or None
        )
        decisions: dict[str, Decision] = {d.key: d for d in request.decisions}

        if request.apply_deletions:
            self._guard_mass_deletion(proposals, request)

        # external_id -> локальный id, по сущностям. Заполняется как уже
        # связанными строками, так и созданными в этом прогоне: ребёнок
        # разрешает родителя именно отсюда. Берём и зависимости выбранного:
        # родителя мог связать другой, более ранний прогон, и без него
        # ребёнок не разрешился бы.
        id_map: dict[EduPlanEntity, dict[str, int]] = {}
        for entity in self._with_dependencies(entities):
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

        results: dict[EduPlanEntity, ApplyResult] = {entity: ApplyResult(entity=entity) for entity in entities}

        try:
            for entity in entities:
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
            if EduPlanEntity.teacher in entities:
                # Роль выдаём всем преподавателям, а не только тронутым в этом
                # прогоне: у приехавшего раньше предложение будет `unchanged`,
                # и `upsert_teacher` до него не дойдёт — а без роли человек
                # входит в систему и упирается в 403 на каждом экране.
                await eduplan_repository.ensure_teacher_role(session)
            await session.commit()
        except Exception:
            await session.rollback()
            logger.exception("EPMOS apply %s провалился, изменения откачены", request.run_id)
            raise

        logger.info("EPMOS apply %s [%s] завершён", request.run_id, ",".join(e.value for e in entities))
        return ApplyResponse(
            run_id=request.run_id,
            entities=list(entities),
            results=list(results.values()),
            finished_at=utcnow_naive().isoformat(),
        )

    async def sync_entity(
        self,
        session: AsyncSession,
        entity: EduPlanEntity,
        *,
        apply_deactivations: bool = False,
        apply_deletions: bool = False,
        allow_bulk_delete: bool = False,
    ) -> tuple[PreviewResponse, ApplyResponse]:
        """Один раздел: предпросмотр и сразу применение однозначного.

        Нужно там, где разбирать нечего — повторный прогон уже связанного
        справочника. Конфликты не применяются и остаются в предпросмотре:
        их видно в ответе, и разобрать их можно на общем экране.
        """
        preview = await self.build_preview(session, [entity])
        applied = await self.apply(
            session,
            ApplyRequest(
                run_id=preview.run_id,
                decisions=[],
                apply_deactivations=apply_deactivations,
                apply_deletions=apply_deletions,
                allow_bulk_delete=allow_bulk_delete,
            ),
        )
        return preview, applied

    @staticmethod
    def _guard_mass_deletion(proposals: list[Proposal], request: ApplyRequest) -> None:
        """Ommaviy oʻchirishdan saqlaydi.

        «EPMOS da yoʻq — oʻchiramiz» qoidasi tashqi tizim javobiga toʻliq
        ishonadi. EPMOS sahifani uzib qoʻysa, vaqt tugasa yoki manzil
        almashsa (bu allaqachon boʻlgan: 502 va `edu.plan` dan `epmos` ga
        koʻchish), yetib kelmagan xodimlar «ishdan ketgan» deb tushuniladi
        va kurslari bilan birga oʻchib ketardi. Qaytarib boʻlmaydi.
        Shuning uchun ulush chegaradan oshsa, progon toʻxtaydi va
        administratordan alohida tasdiq soʻraydi.
        """
        teacher_proposals = [p for p in proposals if p.entity == EduPlanEntity.teacher]
        if not teacher_proposals:
            return
        to_delete = sum(1 for p in teacher_proposals if p.action == ProposalAction.deactivate)
        if to_delete == 0 or request.allow_bulk_delete:
            return

        share = to_delete / len(teacher_proposals)
        if share > DELETE_SHARE_THRESHOLD:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"EPMOS {len(teacher_proposals) - to_delete} ta oʻqituvchini qaytardi, "
                    f"{to_delete} tasi esa yoʻq ({share:.0%}). Bu EPMOS tomonidagi nosozlikka "
                    "oʻxshaydi. Haqiqatan oʻchirish kerak boʻlsa, «ommaviy oʻchirishga ruxsat» "
                    "bilan qayta yuboring."
                ),
            )

    @staticmethod
    def _fail(
        result: ApplyResult,
        entity: EduPlanEntity,
        proposal: Proposal,
        reason: str,
        detail: str,
    ) -> None:
        """Qoʻllab boʻlmagan yozuvni kod shaklida qayd etadi.

        `errors` bilan yonma-yon yuritiladi: biri odam uchun, bu esa
        EPMOS hisoboti uchun. `detail` ni 1000 belgida kesamiz — qabul
        qiluvchi tomonning cheklovi shunday, va 422 olib qolmaslik
        uchun chegara shu yerda qoʻyiladi.
        """
        result.failures.append(
            SyncFailure(
                entity=entity,
                external_id=proposal.external_id,
                reason=reason,
                detail=detail[:1000],
            )
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
        # Родителя может не оказаться в карте, если предпросмотр пришёл из
        # снимка, снятого до появления зависимости. Пустой словарь даёт
        # понятный «родитель не разрешён», а не KeyError посреди прогона.
        parents = lambda e: id_map.get(e, {})  # noqa: E731
        action = decision.action if decision else proposal.action
        local_id = decision.local_id if decision and decision.local_id else proposal.local_id

        if action == ProposalAction.unchanged:
            return

        if action == ProposalAction.conflict:
            # Неразобранный конфликт применять нельзя: связать вслепую значит
            # оторвать студентов и историю результатов от нужной строки.
            result.skipped += 1
            self._fail(
                result,
                entity,
                proposal,
                "ambiguous_match",
                "Nomi boʻyicha bir nechta mahalliy satr mos keldi — qaysi biri ekani aniq emas",
            )
            return

        if action == ProposalAction.deactivate:
            if local_id is None:
                result.skipped += 1
                return

            # Oʻqituvchilar boʻlimida admin butunlay oʻchirishni tanlashi
            # mumkin: EPMOS dan ketgan xodim platformada qolmasin.
            # Qaytarib boʻlmaydi, shuning uchun aniq bayroq talab etiladi.
            if entity == EduPlanEntity.teacher and request.apply_deletions:
                row = await session.get(Teacher, local_id)
                if row is None:
                    # Qator allaqachon yoʻq (masalan qoʻlda oʻchirilgan):
                    # hisobotda u oʻchirilgan deb koʻrinmasligi kerak.
                    result.skipped += 1
                    return
                removed = await eduplan_repository.delete_teacher(session, row)
                result.deleted += 1
                for key, count in removed.items():
                    result.deleted_related[key] = result.deleted_related.get(key, 0) + count
                return

            if not request.apply_deactivations:
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

        # Har bir qator — alohida SAVEPOINT.
        #
        # Pastdagi `except` bitta buzuq qator butun progonni yiqitmasligi
        # uchun qoʻyilgan edi, lekin u yetarli emas: `IntegrityError` dan
        # keyin SESSIYA buziladi va undan keyingi har bir amal
        # `PendingRollbackError` beradi — progon baribir yiqilib, mijoz
        # 500 olardi. Serverda `uq_teachers_hemis_id` da aynan shunday
        # boʻldi: bitta xodim butun sinxronizatsiyani toʻxtatib qoʻydi.
        #
        # Ichki tranzaksiya buzuq qatorni yolgʻiz orqaga qaytaradi,
        # undan oldingi muvaffaqiyatli qatorlar esa joyida qoladi.
        try:
            async with session.begin_nested():
                if entity == EduPlanEntity.faculty:
                    row = await eduplan_repository.upsert_faculty(session, proposal.external_id, changes["name"], existing)

                elif entity == EduPlanEntity.kafedra:
                    faculty_id = parents(EduPlanEntity.faculty).get(changes["faculty_external_id"])
                    if faculty_id is None:
                        result.errors.append(f"Кафедра {proposal.external_name}: факультет не разрешён, пропущена")
                        self._fail(result, entity, proposal, "parent_missing", "Fakultet hali bogʻlanmagan")
                        result.skipped += 1
                        return
                    row = await eduplan_repository.upsert_kafedra(
                        session, proposal.external_id, changes["name"], faculty_id, existing
                    )
                    kafedra_faculty[row.id] = faculty_id

                elif entity == EduPlanEntity.speciality:
                    kafedra_id = parents(EduPlanEntity.kafedra).get(changes["kafedra_external_id"])
                    if kafedra_id is None:
                        result.errors.append(f"Специальность {proposal.external_name}: кафедра не разрешена, пропущена")
                        self._fail(result, entity, proposal, "parent_missing", "Kafedra hali bogʻlanmagan")
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
                    speciality_id = parents(EduPlanEntity.speciality).get(changes["speciality_external_id"])
                    # У группы в EduPlan факультета нет — выводим по цепочке
                    # специальность -> кафедра -> факультет.
                    faculty_id = None
                    if speciality_id is not None:
                        kafedra_id = speciality_kafedra.get(speciality_id)
                        faculty_id = kafedra_faculty.get(kafedra_id) if kafedra_id else None
                    if faculty_id is None:
                        result.errors.append(f"Группа {proposal.external_name}: не удалось вывести факультет, пропущена")
                        self._fail(result, entity, proposal, "parent_missing", "Fakultetni aniqlab boʻlmadi: mutaxassislik yoki kafedra bogʻlanmagan")
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
                        changes.get("hemis_group_id"),
                        changes.get("education_language"),
                    )

                elif entity == EduPlanEntity.subject:
                    kafedra_id = parents(EduPlanEntity.kafedra).get(changes["kafedra_external_id"])
                    # Reja topilmasa — `None`: fan baribir saqlanadi, faqat
                    # ro'yxatda uni nom bilan ajratib bo'lmaydi. Bu qattiq
                    # bog'liqlik emas, shuning uchun progon to'xtamaydi.
                    curriculum_external_id = changes.get("curriculum_external_id")
                    curriculum_id = (
                        parents(EduPlanEntity.curriculum).get(curriculum_external_id)
                        if curriculum_external_id
                        else None
                    )
                    row = await eduplan_repository.upsert_subject(
                        session,
                        proposal.external_id,
                        changes["name"],
                        kafedra_id,
                        existing,
                        curriculum_id,
                        changes.get("semester"),
                    )

                elif entity == EduPlanEntity.curriculum:
                    speciality_id = parents(EduPlanEntity.speciality).get(changes["speciality_external_id"])
                    # Кафедра и факультет выводятся по той же цепочке, что и у
                    # группы: специальность -> кафедра -> факультет.
                    #
                    # Если специальность не разрешена, связки НЕ затираем.
                    # Новый план заводим и без них — сам по себе он осмысленная
                    # строка справочника. А вот у существующего молчаливое
                    # обнуление означало бы, что план исчез из выборок по
                    # факультету, и причину пришлось бы искать в базе: строка на
                    # месте, данные на месте, а в списке её нет.
                    if speciality_id is None:
                        if existing is not None and existing.speciality_id is not None:
                            result.errors.append(
                                f"O'quv reja {proposal.external_name}: mutaxassislik (EPMOS #"
                                f"{changes['speciality_external_id']}) bog'lanmagan — avval "
                                "«Mutaxassisliklarni sinxronlash» ni bajaring. Rejaning eski "
                                "bog'lanishi saqlab qolindi."
                            )
                        speciality_id = existing.speciality_id if existing else None
                        kafedra_id = existing.kafedra_id if existing else None
                        faculty_id = existing.faculty_id if existing else None
                    else:
                        kafedra_id = speciality_kafedra.get(speciality_id)
                        faculty_id = kafedra_faculty.get(kafedra_id) if kafedra_id else None

                    row = await eduplan_repository.upsert_curriculum(
                        session,
                        proposal.external_id,
                        changes["name"],
                        speciality_id,
                        kafedra_id,
                        faculty_id,
                        changes.get("education_form"),
                        changes.get("education_type"),
                        existing,
                    )

                elif entity == EduPlanEntity.teacher:
                    kafedra_ext = changes.get("kafedra_external_id")
                    kafedra_id = parents(EduPlanEntity.kafedra).get(kafedra_ext) if kafedra_ext else None
                    # Qator yoziladi, lekin ayrim maydonlar yozilmasligi
                    # mumkin (band `hemis_id`, band login). Bu xatolik emas,
                    # lekin jimgina qolmasligi kerak — repozitoriy sabablarni
                    # shu roʻyxatga soladi.
                    refused: list[dict] = []
                    row = await eduplan_repository.upsert_teacher(
                        session,
                        external_id=proposal.external_id,
                        username=changes["username"],
                        hemis_id=changes.get("hemis_id"),
                        first_name=changes["first_name"],
                        last_name=changes["last_name"],
                        third_name=changes["third_name"],
                        full_name=changes["full_name"] or changes["username"],
                        kafedra_id=kafedra_id,
                        existing=existing,
                        failures=refused,
                    )
                    for item in refused:
                        result.errors.append(f"{proposal.external_name}: {item['detail']}")
                        self._fail(result, entity, proposal, item["reason"], item["detail"])
                else:
                    return
        except Exception as e:  # noqa: BLE001 — одна битая строка не должна валить прогон
            logger.warning("EduPlan: %s %r не применена: %s", entity.value, proposal.external_name, e)
            result.errors.append(f"{proposal.external_name}: {e}")
            self._fail(result, entity, proposal, "apply_failed", str(e))
            result.skipped += 1
            return

        id_map.setdefault(entity, {})[proposal.external_id] = row.id
        if was_new:
            result.created += 1
        elif action == ProposalAction.link:
            result.linked += 1
        else:
            result.updated += 1


eduplan_sync_service = EduPlanSyncService()
