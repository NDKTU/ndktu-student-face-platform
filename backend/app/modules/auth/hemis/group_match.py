"""Сопоставление групп HEMIS с нашим зеркалом EPOS.

Зачем это отдельный шаг перед импортом студентов. Столбец
``groups.hemis_group_id`` — единственная надёжная связка: названия в двух
системах расходятся систематически («3B-24 KM (NMT)» против
«3B-24 KM (N.M.T)», «31B-25 KI» против «31B-25 KI (OKI)»), и сопоставление по
имени промахивается примерно на трети групп. Если импортировать студентов до
привязки, тысячи человек окажутся без группы, а часть — в чужой.

Два источника уверенности, в порядке убывания:

1. **Голосование по уже имеющимся студентам.** У наших студентов группа
   проставлена, а HEMIS для того же ``student_id_number`` отдаёт свой
   ``group.id``. Если все студенты нашей группы указывают на один и тот же
   идентификатор HEMIS — это он и есть. Работает независимо от написания.
2. **Точное совпадение имени** (после нормализации регистра и разделителей) —
   когда своих студентов в группе ещё нет.

Всё остальное уходит администратору списком с подсказками: связать не ту
группу хуже, чем не связать вовсе.
"""

import logging
import re
from collections import Counter, defaultdict
from difflib import get_close_matches

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import Student
from app.modules.organization_structure.model import Group

from .schemas import GroupMatchProposal

logger = logging.getLogger(__name__)

#: Доля голосов, при которой связка считается однозначной. Один-два
#: переведённых студента не должны ломать сопоставление всей группы.
VOTE_CONFIDENCE = 0.8


def normalize(name: str) -> str:
    """Имя без регистра, пробелов и знаков: «3B-24 KM (N.M.T)» → «3b24kmnmt»."""
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def _hemis_groups(items: list[dict]) -> tuple[dict[int, str], Counter]:
    names: dict[int, str] = {}
    counts: Counter = Counter()
    for item in items:
        group = item.get("group") or {}
        gid = group.get("id")
        if gid:
            names[int(gid)] = group.get("name") or ""
            counts[int(gid)] += 1
    return names, counts


def _votes(items: list[dict], local_by_sid: dict[str, int]) -> dict[int, Counter]:
    """Наша группа → сколько её студентов указывают на каждую группу HEMIS."""
    votes: dict[int, Counter] = defaultdict(Counter)
    for item in items:
        sid = item.get("student_id_number")
        group = (item.get("group") or {}).get("id")
        local_group = local_by_sid.get(sid)
        if sid and group and local_group:
            votes[local_group][int(group)] += 1
    return votes


async def build_proposals(session: AsyncSession, items: list[dict]) -> list[GroupMatchProposal]:
    # Arxivdagi guruhlar nomzod boʻlmaydi. Ular EPOS'dan yoʻqolgan yoki
    # dublikat sifatida birlashtirilgan satrlar; nomzodlar orasida qolsa,
    # har bir nomga ikkita javob chiqib, nom boʻyicha bogʻlash butunlay
    # ishlamay qolardi — aynan shu sabab 419 guruh «qoʻlda hal qiling»
    # roʻyxatiga tushib turgan edi.
    groups = list((await session.execute(select(Group).where(Group.is_active.is_(True)))).scalars().all())
    local_names = {g.id: g.name for g in groups}
    # `groups.hemis_group_id` — строковый столбец, поэтому ключи строками.
    already = {str(g.hemis_group_id): g.id for g in groups if g.hemis_group_id}

    by_norm: dict[str, list[int]] = defaultdict(list)
    for group in groups:
        by_norm[normalize(group.name)].append(group.id)

    local_by_sid = {
        sid: gid
        for sid, gid in await session.execute(
            select(Student.student_id_number, Student.group_id).where(Student.group_id.is_not(None))
        )
    }

    hemis_names, hemis_counts = _hemis_groups(items)
    votes = _votes(items, local_by_sid)

    # Голоса наизнанку: группа HEMIS → наши группы, которые на неё указывают.
    vote_pick: dict[int, tuple[int, float]] = {}
    for local_id, counter in votes.items():
        total = sum(counter.values())
        hemis_id, hits = counter.most_common(1)[0]
        share = hits / total if total else 0
        if share >= VOTE_CONFIDENCE:
            previous = vote_pick.get(hemis_id)
            if previous is None or share > previous[1]:
                vote_pick[hemis_id] = (local_id, share)

    taken = set(already.values()) | {local_id for local_id, _ in vote_pick.values()}

    proposals: list[GroupMatchProposal] = []
    for hemis_id, hemis_name in sorted(hemis_names.items(), key=lambda x: -hemis_counts[x[0]]):
        base = GroupMatchProposal(
            hemis_group_id=hemis_id,
            hemis_group_name=hemis_name,
            student_count=hemis_counts[hemis_id],
        )

        existing_local = already.get(str(hemis_id))
        if existing_local:
            base.kind = "already"
            base.reason = "existing"
            base.group_id = existing_local
            base.group_name = local_names.get(existing_local)
            proposals.append(base)
            continue

        if hemis_id in vote_pick:
            local_id, _ = vote_pick[hemis_id]
            base.kind = "auto"
            base.reason = "vote"
            base.group_id = local_id
            base.group_name = local_names.get(local_id)
            proposals.append(base)
            continue

        candidates = [gid for gid in by_norm.get(normalize(hemis_name), []) if gid not in taken]
        if len(candidates) == 1:
            base.kind = "auto"
            base.reason = "name"
            base.group_id = candidates[0]
            base.group_name = local_names.get(candidates[0])
            proposals.append(base)
            continue

        # Ни голосов, ни точного имени: показываем похожие и ждём решения.
        free_names = {gid: name for gid, name in local_names.items() if gid not in taken}
        near = get_close_matches(hemis_name, list(free_names.values()), n=5, cutoff=0.55)
        name_to_id = {name: gid for gid, name in free_names.items()}
        base.kind = "review" if near else "unmatched"
        base.candidates = [{"group_id": name_to_id[n], "name": n} for n in near if n in name_to_id]
        proposals.append(base)

    return proposals
