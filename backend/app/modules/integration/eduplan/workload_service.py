"""Импорт нагрузки EduPlan в связки преподаватель-предмет и преподаватель-группа.

Ради этого интеграция и затевалась: сейчас ``teacher_subject`` и
``teacher_group`` заполняют руками.

Тройка (преподаватель, предмет, группа) больше не хранится: нагрузка
раскладывается на две пары — ``teacher_subject`` и ``teacher_group``.

Три особенности источника, из-за которых наивный импорт не работает:

* на одну связку (преподаватель, предмет, группа) в EduPlan приходится по
  строке нагрузки на каждый вид занятий — лекция, практика, лаборатория и так
  далее. Без схлопывания ограничение ``uq_teacher_subject`` сорвало бы
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

from app.modules.auth.model import Teacher, TeacherAssignment, TeacherSubject
from app.modules.organization_structure.model import Group, TeacherGroup
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

        created, updated = await self._persist(session, collapsed, academic_year_id)
        deactivated = await self._deactivate_missing(
            session,
            {(teacher_id, subject_id) for teacher_id, subject_id, _ in collapsed},
            {(teacher_id, group_id) for teacher_id, _, group_id in collapsed},
            set(collapsed),
        )

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
    async def _persist(
        session: AsyncSession,
        collapsed: dict[tuple[int, int, int], dict],
        academic_year_id: int | None = None,
    ):
        if not collapsed:
            return 0, 0

        # Uchlikni oʻz jadvaliga yozamiz. Eski ikkita jadval ham avvalgidek
        # toʻldiriladi: ularga savollarning koʻrinishi, fayl kutubxonasi va
        # natijalar filtri tayanadi.
        existing_ta = {
            (r.teacher_id, r.subject_id, r.group_id): r
            for r in (await session.execute(select(TeacherAssignment))).scalars().all()
        }

        # (teacher, subject) va (teacher, group) juftliklariga yoyamiz.
        by_subject: dict[tuple[int, int], dict] = defaultdict(lambda: {"load_types": set(), "semester_types": set()})
        pairs_group: set[tuple[int, int]] = set()
        for (teacher_id, subject_id, group_id), bucket in collapsed.items():
            b = by_subject[(teacher_id, subject_id)]
            b["load_types"] |= bucket["load_types"]
            b["semester_types"] |= bucket["semester_types"]
            pairs_group.add((teacher_id, group_id))

        created = updated = 0
        now = utcnow_naive()

        for (teacher_id, subject_id, group_id), bucket in collapsed.items():
            row = existing_ta.get((teacher_id, subject_id, group_id))
            if row is None:
                row = TeacherAssignment(teacher_id=teacher_id, subject_id=subject_id, group_id=group_id)
                created += 1
            else:
                updated += 1
            row.load_types = sorted(bucket["load_types"])
            row.semester_type = ", ".join(sorted(bucket["semester_types"])) or None
            row.academic_year_id = academic_year_id
            # external_id boʻsh: bitta biriktirma bir nechta yuklama satridan
            # yigʻiladi va yagona tashqi id'ga ega emas.
            row.external_source = SOURCE_EDUPLAN
            row.synced_at = now
            row.is_active = True
            session.add(row)

        existing_ts = {
            (r.teacher_id, r.subject_id): r for r in (await session.execute(select(TeacherSubject))).scalars().all()
        }
        for key, bucket in by_subject.items():
            row = existing_ts.get(key)
            if row is None:
                row = TeacherSubject(teacher_id=key[0], subject_id=key[1])
                created += 1
            else:
                updated += 1
            row.load_types = sorted(bucket["load_types"])
            row.semester_type = ", ".join(sorted(bucket["semester_types"])) or None
            # external_id намеренно не заполняем: одна связка собрана из
            # нескольких строк нагрузки и одного внешнего id не имеет.
            # Источник фиксируем, чтобы отличать импортированное от ручного.
            row.external_source = SOURCE_EDUPLAN
            row.synced_at = now
            row.is_active = True
            session.add(row)

        existing_tg = {
            (r.teacher_id, r.group_id): r for r in (await session.execute(select(TeacherGroup))).scalars().all()
        }
        for key in pairs_group:
            row = existing_tg.get(key)
            if row is None:
                row = TeacherGroup(teacher_id=key[0], group_id=key[1])
                created += 1
            else:
                updated += 1
            row.external_source = SOURCE_EDUPLAN
            row.synced_at = now
            row.is_active = True
            session.add(row)

        await session.flush()
        return created, updated

    @staticmethod
    async def _deactivate_missing(
        session: AsyncSession,
        present_subjects: set[tuple[int, int]],
        present_groups: set[tuple[int, int]],
        present_triples: set[tuple[int, int, int]] | None = None,
    ) -> int:
        """Связки, пропавшие из нагрузки, гасим, но не удаляем.

        Удаление оторвало бы преподавателя от уже проведённых тестов. Ручные
        связки (external_source IS NULL) не трогаем вовсе.
        """
        deactivated = 0
        now = utcnow_naive()

        # Uchlik boʻyicha alohida: juftlik saqlanib qolib, uchlik oʻzgargan
        # holat mavjud — oʻqituvchi bitta guruhdan boʻshab boshqasiga oʻtsa,
        # (oʻqituvchi, fan) juftligi joyida qoladi. Faqat juftliklarni
        # tekshirsak, eski uchlik faol boʻlib qolar va yuklamada mavjud
        # boʻlmagan dars koʻrinardi.
        if present_triples is not None:
            ta_rows = (
                (
                    await session.execute(
                        select(TeacherAssignment).where(
                            TeacherAssignment.external_source == SOURCE_EDUPLAN,
                            TeacherAssignment.is_active.is_(True),
                        )
                    )
                )
                .scalars()
                .all()
            )
            for row in ta_rows:
                if (row.teacher_id, row.subject_id, row.group_id) not in present_triples:
                    row.is_active = False
                    row.synced_at = now
                    session.add(row)
                    deactivated += 1

        ts_rows = (
            (
                await session.execute(
                    select(TeacherSubject).where(
                        TeacherSubject.external_source == SOURCE_EDUPLAN,
                        TeacherSubject.is_active.is_(True),
                    )
                )
            )
            .scalars()
            .all()
        )
        for row in ts_rows:
            if (row.teacher_id, row.subject_id) not in present_subjects:
                row.is_active = False
                row.synced_at = now
                session.add(row)
                deactivated += 1

        tg_rows = (
            (
                await session.execute(
                    select(TeacherGroup).where(
                        TeacherGroup.external_source == SOURCE_EDUPLAN,
                        TeacherGroup.is_active.is_(True),
                    )
                )
            )
            .scalars()
            .all()
        )
        for row in tg_rows:
            if (row.teacher_id, row.group_id) not in present_groups:
                row.is_active = False
                row.synced_at = now
                session.add(row)
                deactivated += 1

        await session.flush()
        return deactivated


eduplan_workload_service = EduPlanWorkloadService()
