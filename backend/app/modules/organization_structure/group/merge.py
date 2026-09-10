"""Takrorlangan guruhlarni birlashtirish.

Nega kerak boʻlib qoldi. EPOS guruhga bergan ``external_id`` ni almashtirsa,
zerkalo uni tanimaydi va yangi qator yaratadi — eskisi esa oʻz talabalari,
kurslari va yuklamalari bilan yonida qolaveradi. 2026-09-09 dagi progn shu
tarzda 462 ta guruh nomini ikki nusxaga boʻlib yubordi.

Buning eng ogʻriqli oqibati talabalar importida koʻrinadi: HEMIS guruhini
nomiga qarab bogʻlashda ikkita bir xil nomzod chiqadi, ``group_match`` esa
toʻgʻri qiladi va taxmin qilmaydi — natijada 419 guruh «qoʻlda hal qiling»
roʻyxatiga tushdi va 5620 talaba guruhsiz qoldi.

**Qaysi nusxa tirik.** Oxirgi progn tekkani, yaʼni ``synced_at`` yangirogʻi:
zerkalo faqat EPOS'da hali bor satrni yangilaydi. Bu qoida taxmin emas —
lokal bazada eski nusxalar 01.09 da, yangilari 09.09 da sinxronlangan.

**Hech nima oʻchirilmaydi.** Eskisi ``is_active = False`` boʻladi, unga
bogʻlangan hamma narsa tirik nusxaga koʻchiriladi. Davomat va natijalardagi
``group_id`` ham koʻchadi: bu bir guruhning ikki nusxasi, arxivdagi qatorga
ishora qilib turgan hisobot esa kelajakda boʻsh chiqardi.
"""

import logging

from sqlalchemy import delete, func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.model import Student, TeacherAssignment
from app.modules.course.model import CourseGroup, Lesson, LessonAttendance
from app.modules.organization_structure.model import Group, TeacherGroup
from app.modules.quiz.model import Quiz, Result

from .schemas import GroupDuplicateCluster, GroupDuplicatePreview, GroupMergeResponse, GroupMergeRow

logger = logging.getLogger(__name__)


def _key(name: str) -> str:
    """Nomni solishtirish kaliti: registr, boʻshliq va tinish belgisisiz.

    ``group_match.normalize`` bu yerga toʻgʻri kelmaydi: u lotin boʻlmagan
    harfni butunlay tashlab yuboradi, chunki HEMIS bilan solishtirishda
    nomlar lotinda keladi. Bu yerda esa aynan shu farq muhim —
    «107A-25 KM огр» va «107A-25 KM» ikki xil guruh, u yerdagi qoida bilan
    esa ikkalasi ham «107a25km» boʻlib, bir-biriga qoʻshilib ketardi.
    """
    return "".join(ch for ch in (name or "").casefold() if ch.isalnum())

#: Guruhga ishora qiladigan jadvallar. Ikkinchi element — koʻchirishda
#: toʻqnashuv beradigan unikal kalitning qolgan ustunlari; boʻsh boʻlsa
#: toʻqnashuv boʻlmaydi va oddiy ``UPDATE`` yetadi.
REFERENCES: list[tuple[type, list[str]]] = [
    (Student, []),
    (CourseGroup, ["course_id"]),
    (TeacherGroup, ["teacher_id"]),
    (TeacherAssignment, ["teacher_id", "subject_id"]),
    (Lesson, []),
    (LessonAttendance, []),
    (Quiz, []),
    (Result, []),
]


class GroupMergeService:
    # ------------------------------------------------------------------ #
    #  Takliflar
    # ------------------------------------------------------------------ #
    async def _clusters(self, session: AsyncSession) -> list[list[Group]]:
        """Nomi bir xil boʻlgan faol guruhlar toʻdalari.

        Nom normallashtirilgan holda solishtiriladi — «107A-24 ENM» va
        «107a-24  enm» bir xil guruh. Fakultet ham hisobga olinadi: nomdosh,
        lekin boshqa fakultetdagi guruh — bu dublikat emas.
        """
        groups = list(await session.scalars(select(Group).where(Group.is_active.is_(True))))
        buckets: dict[tuple[str, int | None], list[Group]] = {}
        for group in groups:
            buckets.setdefault((_key(group.name), group.faculty_id), []).append(group)
        return [rows for rows in buckets.values() if len(rows) > 1]

    @staticmethod
    def _live(rows: list[Group]) -> Group:
        """Toʻdadagi tirik nusxa: oxirgi progn tekkani.

        ``synced_at`` boʻsh boʻlgan qator (qoʻlda kiritilgan) hech qachon
        tirik deb tanlanmaydi — zerkalo unga tegmaydi va uni EPOS bilmaydi.
        """
        return max(rows, key=lambda g: (g.synced_at is not None, g.synced_at or 0, g.id))

    async def _counts(self, session: AsyncSession, group_ids: list[int]) -> dict[int, dict[str, int]]:
        """Har bir guruh boʻyicha bogʻlangan yozuvlar soni — admin koʻrishi uchun."""
        result: dict[int, dict[str, int]] = {gid: {} for gid in group_ids}
        for model, _ in REFERENCES:
            rows = await session.execute(
                select(model.group_id, func.count())
                .where(model.group_id.in_(group_ids))
                .group_by(model.group_id)
            )
            for group_id, count in rows:
                if count:
                    result[group_id][model.__tablename__] = count
        return result

    async def preview(self, session: AsyncSession) -> GroupDuplicatePreview:
        clusters = await self._clusters(session)
        if not clusters:
            return GroupDuplicatePreview(clusters=[])

        all_ids = [group.id for rows in clusters for group in rows]
        counts = await self._counts(session, all_ids)

        payload: list[GroupDuplicateCluster] = []
        for rows in sorted(clusters, key=lambda r: r[0].name):
            live = self._live(rows)
            payload.append(
                GroupDuplicateCluster(
                    name=live.name,
                    faculty_id=live.faculty_id,
                    keep=self._row(live, counts, keep=True),
                    merge=[self._row(g, counts, keep=False) for g in rows if g.id != live.id],
                )
            )
        return GroupDuplicatePreview(clusters=payload)

    @staticmethod
    def _row(group: Group, counts: dict[int, dict[str, int]], keep: bool) -> GroupMergeRow:
        linked = counts.get(group.id, {})
        return GroupMergeRow(
            group_id=group.id,
            name=group.name,
            external_id=group.external_id,
            synced_at=group.synced_at,
            hemis_group_id=group.hemis_group_id,
            students=linked.get("students", 0),
            courses=linked.get("course_groups", 0),
            workloads=linked.get("teacher_assignments", 0),
            lessons=linked.get("lessons", 0),
            quizzes=linked.get("quizzes", 0),
            results=linked.get("results", 0),
            keep=keep,
        )

    # ------------------------------------------------------------------ #
    #  Birlashtirish
    # ------------------------------------------------------------------ #
    async def apply(self, session: AsyncSession, group_ids: list[int] | None = None) -> GroupMergeResponse:
        """Toʻdalarni birlashtiradi. ``group_ids`` — faqat oʻsha toʻdalar.

        ``group_ids`` da toʻdaning istalgan qatori koʻrsatilsa yetadi: birlashuv
        baribir butun toʻda ustidan boʻladi, yarim birlashtirilgan toʻda esa
        avvalgisidan ham yomonroq holat boʻlardi.
        """
        clusters = await self._clusters(session)
        if group_ids:
            wanted = set(group_ids)
            clusters = [rows for rows in clusters if wanted & {g.id for g in rows}]

        merged_clusters = 0
        archived = 0
        moved: dict[str, int] = {}

        for rows in clusters:
            live = self._live(rows)
            for stale in rows:
                if stale.id == live.id:
                    continue
                for model, conflict_keys in REFERENCES:
                    count = await self._move(session, model, conflict_keys, stale.id, live.id)
                    if count:
                        moved[model.__tablename__] = moved.get(model.__tablename__, 0) + count
                chats = await self._move_chat_rooms(session, stale.id, live.id)
                if chats:
                    moved["chat_rooms"] = moved.get("chat_rooms", 0) + chats
                # HEMIS bogʻlanishi ham koʻchadi: u tirik nusxada turishi kerak.
                if stale.hemis_group_id and not live.hemis_group_id:
                    live.hemis_group_id = stale.hemis_group_id
                    live.hemis_group_id_source = stale.hemis_group_id_source
                    stale.hemis_group_id = None
                stale.is_active = False
                archived += 1
            merged_clusters += 1

        await session.commit()
        logger.info(
            "Guruhlar birlashtirildi: %d toʻda, %d qator arxivga, koʻchirilgan yozuvlar: %s",
            merged_clusters,
            archived,
            moved,
        )
        return GroupMergeResponse(clusters=merged_clusters, archived=archived, moved=moved)

    @staticmethod
    async def _move(
        session: AsyncSession,
        model: type,
        conflict_keys: list[str],
        stale_id: int,
        live_id: int,
    ) -> int:
        """Bitta jadvaldagi ishoralarni koʻchiradi.

        Unikal kaliti bor jadvalda tirik nusxada aynan shunday satr allaqachon
        boʻlishi mumkin («ikkala nusxa ham bitta kursga biriktirilgan»). Bunday
        satr koʻchirilmaydi, oʻchiriladi: aks holda ``UPDATE`` unikal indeksga
        urilib, butun tranzaksiyani uzib qoʻyardi.
        """
        if conflict_keys:
            live_keys = {
                tuple(row)
                for row in await session.execute(
                    select(*[getattr(model, key) for key in conflict_keys]).where(model.group_id == live_id)
                )
            }
            if live_keys:
                stale_rows = (
                    await session.execute(
                        select(model.id, *[getattr(model, key) for key in conflict_keys]).where(
                            model.group_id == stale_id
                        )
                    )
                ).all()
                doomed = [row[0] for row in stale_rows if tuple(row[1:]) in live_keys]
                if doomed:
                    await session.execute(delete(model).where(model.id.in_(doomed)))

        result = await session.execute(
            update(model).where(model.group_id == stale_id).values(group_id=live_id)
        )
        return result.rowcount or 0


    @staticmethod
    async def _move_chat_rooms(session: AsyncSession, stale_id: int, live_id: int) -> int:
        """Chat xonalari — SQL orqali, chunki modeli hali `main` da yoʻq.

        Jadval bazada bor (chat kodi alohida shoxda kutib turibdi), va uni
        eʼtiborsiz qoldirsak, xonalar arxivdagi guruhga ishora qilib qolardi.
        Jadval boʻlmagan bazada (masalan testdagi) qadam shunchaki oʻtkazib
        yuboriladi.
        """
        if await session.scalar(text("select to_regclass('chat_rooms')")) is None:
            return 0

        params = {"stale": stale_id, "live": live_id}
        await session.execute(
            text(
                """
                DELETE FROM chat_rooms c
                 WHERE c.group_id = :stale
                   AND EXISTS (
                       SELECT 1 FROM chat_rooms l
                        WHERE l.group_id = :live AND l.course_id = c.course_id
                   )
                """
            ),
            params,
        )
        result = await session.execute(
            text("UPDATE chat_rooms SET group_id = :live WHERE group_id = :stale"), params
        )
        return result.rowcount or 0


group_merge_service = GroupMergeService()
