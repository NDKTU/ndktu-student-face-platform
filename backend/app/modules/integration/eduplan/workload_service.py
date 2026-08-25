"""Импорт нагрузки EduPlan в связки преподаватель-предмет-группа.

Ради этого интеграция и затевалась: сейчас ``teacher_assignments`` заполняют
руками.

Три особенности источника, из-за которых наивный импорт не работает:

* на одну связку (преподаватель, предмет, группа) в EduPlan приходится по
  строке нагрузки на каждый вид занятий — лекция, практика, лаборатория и так
  далее. Без схлопывания ограничение ``uq_teacher_subject_group`` сорвало бы
  транзакцию на первой же паре;
* нагрузка может быть выдана не на группу, а на поток — его нужно развернуть
  в перечень групп;
* ``workload.teacher_id`` — это идентификатор ПОЛЬЗОВАТЕЛЯ EduPlan, а не
  строки преподавателя, поэтому и зеркалим сотрудников по ``/staff/``.
"""

import logging
from collections import defaultdict

from core.mixins.external_ref import SOURCE_EDUPLAN
from core.mixins.time_stamp_mixin import utcnow_naive
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import Teacher, TeacherAssignment
from app.modules.organization_structure.model import Group
from app.modules.quiz.model import Subject

from .client import EduPlanClient
from .credentials import effective_config
from .schemas import EduPlanStream, EduPlanWorkload

logger = logging.getLogger(__name__)


class EduPlanWorkloadService:
    async def sync(self, session: AsyncSession, academic_year_id: int | None = None) -> dict:
        async with EduPlanClient(await effective_config(session)) as client:
            if academic_year_id is None:
                years = await client.academic_years()
                active = next((y for y in years if y.get("is_active")), None)
                if active is None:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="В EduPlan нет активного учебного года — укажите academic_year_id явно",
                    )
                academic_year_id = active["id"]

            raw_workloads = await client.workloads(academic_year_id=academic_year_id)
            raw_streams = await client.streams()

        streams = {s.id: s.group_ids for s in (EduPlanStream.model_validate(r) for r in raw_streams)}

        # Внешний id -> локальный id. Нагрузка ссылается на преподавателей,
        # предметы и группы по идентификаторам EduPlan, поэтому без уже
        # выполненной синхронизации справочников импортировать нечего.
        teacher_by_ext = await self._teacher_map(session)
        subject_by_ext = await self._external_map(session, Subject)
        group_by_ext = await self._external_map(session, Group)

        # (teacher, subject, group) -> сведения. defaultdict схлопывает виды
        # занятий в один набор.
        collapsed: dict[tuple[int, int, int], dict] = defaultdict(
            lambda: {"load_types": set(), "semester_types": set()}
        )

        stats = {
            "academic_year_id": academic_year_id,
            "workloads_total": len(raw_workloads),
            "workloads_inactive_skipped": 0,
            "unresolved_teacher": 0,
            "unresolved_subject": 0,
            "unresolved_group": 0,
            "stream_expanded": 0,
        }

        for raw in raw_workloads:
            wl = EduPlanWorkload.model_validate(raw)

            if not wl.is_active:
                stats["workloads_inactive_skipped"] += 1
                continue

            teacher_id = teacher_by_ext.get(str(wl.teacher_id)) if wl.teacher_id else None
            if teacher_id is None:
                stats["unresolved_teacher"] += 1
                continue

            subject_id = subject_by_ext.get(str(wl.subject_id)) if wl.subject_id else None
            if subject_id is None:
                stats["unresolved_subject"] += 1
                continue

            # Поток разворачиваем в отдельное назначение на каждую группу.
            external_group_ids: list[int] = []
            if wl.group_id:
                external_group_ids = [wl.group_id]
            elif wl.stream_id:
                external_group_ids = streams.get(wl.stream_id, [])
                if external_group_ids:
                    stats["stream_expanded"] += 1

            if not external_group_ids:
                stats["unresolved_group"] += 1
                continue

            for ext_group_id in external_group_ids:
                group_id = group_by_ext.get(str(ext_group_id))
                if group_id is None:
                    stats["unresolved_group"] += 1
                    continue
                bucket = collapsed[(teacher_id, subject_id, group_id)]
                if wl.load_type:
                    bucket["load_types"].add(wl.load_type)
                if wl.semester_type:
                    bucket["semester_types"].add(wl.semester_type)

        created, updated = await self._persist(session, collapsed)
        deactivated = await self._deactivate_missing(session, set(collapsed))

        await session.commit()

        stats.update(
            {
                "assignments_resolved": len(collapsed),
                "created": created,
                "updated": updated,
                "deactivated": deactivated,
            }
        )
        logger.info("EduPlan: нагрузка импортирована, %s", stats)
        return stats

    # ------------------------------------------------------------------ #
    #  Карты соответствий
    # ------------------------------------------------------------------ #
    @staticmethod
    async def _external_map(session: AsyncSession, model) -> dict[str, int]:
        stmt = select(model.external_id, model.id).where(
            model.external_source == SOURCE_EDUPLAN,
            model.external_id.is_not(None),
        )
        return {ext_id: local_id for ext_id, local_id in (await session.execute(stmt)).all()}

    @staticmethod
    async def _teacher_map(session: AsyncSession) -> dict[str, int]:
        """Идентификатор пользователя EduPlan -> id нашей строки преподавателя."""
        stmt = select(Teacher.external_id, Teacher.id).where(
            Teacher.external_source == SOURCE_EDUPLAN,
            Teacher.external_id.is_not(None),
        )
        return {ext_id: local_id for ext_id, local_id in (await session.execute(stmt)).all()}

    # ------------------------------------------------------------------ #
    #  Запись
    # ------------------------------------------------------------------ #
    @staticmethod
    async def _persist(session: AsyncSession, collapsed: dict[tuple[int, int, int], dict]):
        if not collapsed:
            return 0, 0

        existing_rows = (await session.execute(select(TeacherAssignment))).scalars().all()
        existing = {(r.teacher_id, r.subject_id, r.group_id): r for r in existing_rows}

        created = updated = 0
        now = utcnow_naive()

        for key, bucket in collapsed.items():
            teacher_id, subject_id, group_id = key
            load_types = sorted(bucket["load_types"])
            semester_type = ", ".join(sorted(bucket["semester_types"])) or None

            row = existing.get(key)
            if row is None:
                row = TeacherAssignment(
                    teacher_id=teacher_id,
                    subject_id=subject_id,
                    group_id=group_id,
                )
                created += 1
            else:
                updated += 1

            row.load_types = load_types
            row.semester_type = semester_type
            # external_id намеренно не заполняем: одно назначение собрано из
            # нескольких строк нагрузки и одного внешнего id не имеет.
            # Источник фиксируем, чтобы отличать импортированное от ручного.
            row.external_source = SOURCE_EDUPLAN
            row.synced_at = now
            row.is_active = True
            session.add(row)

        await session.flush()
        return created, updated

    @staticmethod
    async def _deactivate_missing(session: AsyncSession, present: set[tuple[int, int, int]]) -> int:
        """Назначения, пропавшие из нагрузки, гасим, но не удаляем.

        Удаление оторвало бы преподавателя от уже проведённых тестов. Ручные
        назначения (external_source IS NULL) не трогаем вовсе.
        """
        stmt = select(TeacherAssignment).where(
            TeacherAssignment.external_source == SOURCE_EDUPLAN,
            TeacherAssignment.is_active.is_(True),
        )
        rows = (await session.execute(stmt)).scalars().all()

        deactivated = 0
        now = utcnow_naive()
        for row in rows:
            if (row.teacher_id, row.subject_id, row.group_id) not in present:
                row.is_active = False
                row.synced_at = now
                session.add(row)
                deactivated += 1

        await session.flush()
        return deactivated


eduplan_workload_service = EduPlanWorkloadService()
