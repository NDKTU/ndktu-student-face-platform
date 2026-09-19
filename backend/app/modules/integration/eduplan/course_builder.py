"""EPOS yuklamasidan kurslarni yigʻish.

Kurs — bu ``(fan, semestr, oʻqituvchi, mashgʻulot turi)`` toʻrtligi. EPOS
yuklamani aynan shu kesimda beradi: ``lecture``, ``practice``, ``lab``.
Oʻqituvchining oʻsha fan, semestr va turdagi barcha guruhlari bitta kursga
yigʻiladi — maʼruza oqimga oʻqiladi, amaliyot va tajriba esa oʻz guruhlariga.

Nega har turga alohida kurs. Ilgari kurs faqat maʼruzachiga yaratilardi,
amaliyot va tajriba olib boradiganlar esa uning kursida assistent boʻlib
turardi. Ya'ni oʻz yuklamasi bor odam birovning kursida mehmon edi: jurnalini
yurita olmasdi, kursini oʻchira olmasdi, guruhlar roʻyxati ham uniki emasdi.
Bazadagi 378 biriktirmadan 117 tasi aynan shunday «egasiz» yuklama edi.

Nega har guruhga alohida kurs emas: maʼruza bitta oqimga oʻqilsa ham nechta
guruh boʻlsa shuncha kurs paydo boʻlardi, oʻqituvchi bir xil darsni bir necha
joyda yuritishi kerak boʻlardi va natijalar boʻlinib ketardi.

Ikki bosqichli: ``build`` hech narsa yozmaydi, ``apply`` yaratadi. Jimgina
yuzlab kurs yaratish — «206 guruh dublikat» tuzogʻining aynan oʻzi.
"""

import logging
from collections import defaultdict

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utils.course_access import ROLE_MAIN
from app.modules.auth.model import Teacher, TeacherAssignment
from app.modules.course.model import Course, CourseGroup, CourseTeacher, Lesson, LessonAttendance
from app.modules.organization_structure.model import Group
from app.modules.quiz.model import Subject

from .schemas import CourseArchiveRow, CoursePlan, CoursePreviewResponse

logger = logging.getLogger(__name__)

SOURCE_EDUPLAN = "eduplan"

#: EPOS «Kuzgi»/«Bahorgi» beradi, bizda semestr — son. ``SEMESTER_LABELS``
#: ham aynan shu juftlik: ``{1: "kuzgi", 2: "bahorgi"}``.
SEMESTER_BY_TYPE = {"Kuzgi": 1, "Bahorgi": 2}

#: Bitta biriktirmada ikkala semestr ham uchraydi — ``workload_service``
#: bir nechta yuklama satrini yigʻganda ``semester_type`` ni vergul bilan
#: birlashtiradi («Bahorgi, Kuzgi», lokal maʼlumotda 378 tadan 42 tasi).
#: Bunday kursga bitta semestr raqamini yozib boʻlmaydi — maydon boʻsh
#: qoladi, nomida ham semestr koʻrsatilmaydi.
SEMESTER_SLUG = {1: "1", 2: "2"}

#: Rus guruhlari oʻzbek guruhlari bilan bitta kursga tushmaydi: dars boshqa
#: tilda, boshqa materiallar bilan oʻtadi. Kalitga qoʻshimcha faqat rus
#: kursida qoʻshiladi — oʻzbek kurslarining mavjud kalitlari oʻzgarmasin,
#: aks holda ularning hammasi arxivga tushib, qaytadan yaratilardi.
LANG_RUSSIAN = "russian"
RUSSIAN_KEY_SUFFIX = ":ru"

#: Ommaviy arxivlashdan himoya. EPOS 502 qaytarsa yoki token eskirsa,
#: ``teacher_assignments`` boʻshab qoladi va hamma kurs «yuklamada yoʻq»
#: boʻlib koʻrinadi. ``_bulk_create_risk`` teskari tomondan aynan shu
#: xatodan saqlaydi va shakli ham shunday: ikkala shart birga bajarilishi
#: kerak. Bittasi yetarli emas — bir nechta kursning arxivga tushishi odatiy
#: hol (oʻqituvchi almashdi), 100 tasiniki esa hech qachon emas.
ARCHIVE_THRESHOLD = 20
ARCHIVE_SHARE_LIMIT = 0.2


class EduPlanCourseBuilder:
    # ------------------------------------------------------------------ #
    #  Rejani yigʻish
    # ------------------------------------------------------------------ #
    @staticmethod
    def _external_key(
        academic_year_id: int | None,
        subject: Subject,
        teacher_user_id: int,
        semester_number: int | None,
        course_type: str,
        education_language: str | None = None,
    ) -> str:
        """Kursning barqaror kaliti — takroriy prognda dublikat boʻlmasligi uchun.

        EPOS'da kurs degan obyekt yoʻq, shuning uchun id'ni oʻzimiz yigʻamiz.
        Fan uchun uning EPOS id'si olinadi: lokal id fan qayta yaratilsa
        oʻzgarib ketardi va oʻsha kurs ikkinchi marta yaratilardi. Semestr va
        tur ham kalitda — bir oʻqituvchi bitta fanni ikkala semestrda va bir
        necha turda olib borishi mumkin, va bular har xil kurslar.
        """
        subject_key = subject.external_id or f"local{subject.id}"
        semester_key = SEMESTER_SLUG.get(semester_number or 0, "x")
        key = f"{academic_year_id or 0}:{subject_key}:{teacher_user_id}:{semester_key}:{course_type}"
        if education_language == LANG_RUSSIAN:
            key += RUSSIAN_KEY_SUFFIX
        return key

    @staticmethod
    def _key_year(external_id: str | None) -> str | None:
        """Kalitning oʻquv yili qismi."""
        if not external_id:
            return None
        return external_id.split(":", 1)[0]

    async def build(self, session: AsyncSession) -> CoursePreviewResponse:
        assignments = list(
            await session.scalars(select(TeacherAssignment).where(TeacherAssignment.is_active.is_(True)))
        )
        if not assignments:
            # Boʻsh yuklama — bu «hamma kurs yoʻqolgan» degani emas, bu
            # sinxronizatsiya ishlamagani degani. Arxiv taklifi ham qilinmaydi.
            return CoursePreviewResponse(plans=[], archive=[])

        teachers = {
            t.id: t
            for t in await session.scalars(select(Teacher).where(Teacher.id.in_({a.teacher_id for a in assignments})))
        }
        subjects = {
            s.id: s
            for s in await session.scalars(select(Subject).where(Subject.id.in_({a.subject_id for a in assignments})))
        }
        group_names: dict[int, str] = {}
        group_languages: dict[int, str | None] = {}
        for group_id, group_name, language in (
            await session.execute(
                select(Group.id, Group.name, Group.education_language).where(
                    Group.id.in_({a.group_id for a in assignments})
                )
            )
        ).all():
            group_names[group_id] = group_name
            group_languages[group_id] = LANG_RUSSIAN if language == LANG_RUSSIAN else None

        # (fan, semestr, tur, til) -> oʻqituvchi -> guruhlar
        Slot = tuple[int, str | None, str, str | None]
        by_slot: dict[Slot, dict[int, set[int]]] = defaultdict(lambda: defaultdict(set))
        # (fan, semestr, tur, til) -> oʻquv yili
        academic_years: dict[Slot, int | None] = {}

        for a in assignments:
            for load_type in a.load_types or []:
                slot = (a.subject_id, a.semester_type, load_type, group_languages.get(a.group_id))
                academic_years.setdefault(slot, a.academic_year_id)
                by_slot[slot][a.teacher_id].add(a.group_id)

        existing = {
            course.external_id: course
            for course in await session.scalars(select(Course).where(Course.external_source == SOURCE_EDUPLAN))
        }

        plans: list[CoursePlan] = []

        for slot, teacher_groups in by_slot.items():
            subject_id, semester_type, course_type, education_language = slot
            subject = subjects.get(subject_id)
            if subject is None:
                continue

            semester_number = SEMESTER_BY_TYPE.get(semester_type or "")
            academic_year_id = academic_years.get(slot)

            for teacher_id, groups in teacher_groups.items():
                teacher = teachers.get(teacher_id)
                if teacher is None:
                    continue

                key = self._external_key(
                    academic_year_id, subject, teacher.user_id, semester_number, course_type, education_language
                )
                ordered_groups = sorted(groups, key=lambda g: group_names.get(g, ""))
                course = existing.get(key)

                plans.append(
                    CoursePlan(
                        external_id=key,
                        exists=course is not None and course.is_active,
                        archived=course is not None and not course.is_active,
                        subject_id=subject_id,
                        subject_name=subject.name,
                        teacher_user_id=teacher.user_id,
                        teacher_name=teacher.full_name,
                        course_type=course_type,
                        semester_type=semester_type,
                        semester_number=semester_number,
                        academic_year_id=academic_year_id,
                        education_language=education_language,
                        group_ids=ordered_groups,
                        group_names=[group_names.get(g, str(g)) for g in ordered_groups],
                    )
                )

        archive = await self._archive_candidates(session, plans, existing)

        plans.sort(key=lambda p: (p.subject_name, p.course_type, p.teacher_name or ""))
        archive.sort(key=lambda row: row.name)

        active_count = sum(1 for course in existing.values() if course.is_active) or 1
        blocked = len(archive) > ARCHIVE_THRESHOLD and len(archive) / active_count > ARCHIVE_SHARE_LIMIT
        return CoursePreviewResponse(plans=plans, archive=archive, archive_blocked=blocked)

    async def _archive_candidates(
        self,
        session: AsyncSession,
        plans: list[CoursePlan],
        existing: dict[str | None, Course],
    ) -> list[CourseArchiveRow]:
        """Yuklamada qolmagan faol kurslar.

        Solishtirish faqat yuklamada uchragan oʻquv yillari doirasida. Busiz
        yangi oʻquv yili boshlanishi bilan barcha kurslarning kaliti oʻzgarardi
        va ularning hammasi «yoʻqolgan» boʻlib koʻrinardi — oʻtgan yilning
        kurslarini arxivlash esa alohida, ongli amal boʻlishi kerak.
        """
        planned_keys = {plan.external_id for plan in plans}
        planned_years = {self._key_year(key) for key in planned_keys}

        stale = [
            course
            for key, course in existing.items()
            if course.is_active and key not in planned_keys and self._key_year(key) in planned_years
        ]
        if not stale:
            return []

        stale_ids = [course.id for course in stale]
        lesson_counts = dict(
            (
                await session.execute(
                    select(Lesson.course_id, func.count(Lesson.id))
                    .where(Lesson.course_id.in_(stale_ids))
                    .group_by(Lesson.course_id)
                )
            ).all()
        )
        teacher_names = dict(
            (
                await session.execute(
                    select(Teacher.user_id, Teacher.full_name).where(
                        Teacher.user_id.in_({course.teacher_id for course in stale})
                    )
                )
            ).all()
        )
        group_rows = (
            await session.execute(
                select(CourseGroup.course_id, Group.name)
                .join(Group, Group.id == CourseGroup.group_id)
                .where(CourseGroup.course_id.in_(stale_ids))
                .order_by(Group.name)
            )
        ).all()
        groups_by_course: dict[int, list[str]] = defaultdict(list)
        for course_id, group_name in group_rows:
            groups_by_course[course_id].append(group_name)

        return [
            CourseArchiveRow(
                course_id=course.id,
                name=course.name,
                course_type=course.course_type,
                teacher_name=teacher_names.get(course.teacher_id),
                group_names=groups_by_course.get(course.id, []),
                lesson_count=lesson_counts.get(course.id, 0),
            )
            for course in stale
        ]

    # ------------------------------------------------------------------ #
    #  Aralash kursni ajratish
    # ------------------------------------------------------------------ #
    async def _detach_from_mixed_course(self, session: AsyncSession, plan: CoursePlan) -> int | None:
        """Rus guruhlarini oʻzbek kursidan chiqaradi — rus kursi yaratilishidan oldin.

        Til hisobga olinishidan oldin rus guruhi oʻzbek guruhlari bilan bitta
        kursga tushardi. Endi uning kursi alohida, lekin eski kursda ham u
        qolib ketsa, talaba ikkita bir xil kursni koʻradi.

        Guruhda shu kursda dars yoki davomat boʻlsa, u koʻchirilmaydi: jurnal
        eski kursda qolib ketardi. Bunday holda ``None`` qaytadi va rus kursi
        yaratilmaydi — guruhni admin qoʻlda koʻchiradi.

        Qaytgan son — koʻchirilgan guruhlar.
        """
        from app.modules.course.course.repository import get_course_repository

        base = await session.scalar(
            select(Course).where(
                Course.external_source == SOURCE_EDUPLAN,
                Course.external_id == plan.external_id.removesuffix(RUSSIAN_KEY_SUFFIX),
                Course.is_active.is_(True),
            )
        )
        if base is None:
            return 0

        moving = list(
            await session.scalars(
                select(CourseGroup.group_id).where(
                    CourseGroup.course_id == base.id,
                    CourseGroup.group_id.in_(plan.group_ids),
                )
            )
        )
        if not moving:
            return 0

        with_lessons = await session.scalar(
            select(func.count(Lesson.id)).where(Lesson.course_id == base.id, Lesson.group_id.in_(moving))
        )
        with_attendance = await session.scalar(
            select(func.count(LessonAttendance.id))
            .join(Lesson, Lesson.id == LessonAttendance.lesson_id)
            .where(Lesson.course_id == base.id, LessonAttendance.group_id.in_(moving))
        )
        if with_lessons or with_attendance:
            logger.warning(
                "EduPlan: %s kursidagi rus guruhlari (%s) koʻchirilmadi — ularda dars yoki davomat bor. "
                "Rus kursi yaratilmadi, guruhni qoʻlda ajrating.",
                base.name,
                ", ".join(plan.group_names),
            )
            return None

        for link in await session.scalars(
            select(CourseGroup).where(CourseGroup.course_id == base.id, CourseGroup.group_id.in_(moving))
        ):
            await session.delete(link)
        await session.flush()

        remaining = list(
            await session.scalars(select(CourseGroup.group_id).where(CourseGroup.course_id == base.id))
        )
        base.name = await get_course_repository._build_course_name(
            session, base.subject_id, remaining, base.semester_number, base.course_type
        )
        return len(moving)

    # ------------------------------------------------------------------ #
    #  Yaratish
    # ------------------------------------------------------------------ #
    async def apply(self, session: AsyncSession, archive: bool = False) -> CoursePreviewResponse:
        """Yoʻq kurslarni yaratadi, qaytganlarini arxivdan tiklaydi.

        Mavjud kursning guruhlari yangilanmaydi: bitta oʻquv yili ichida kurs
        tarkibi qotib turadi. Oʻqituvchi yoki tur oʻzgarsa bu «kurs oʻzgardi»
        emas, «boshqa kurs» degani — kalit boshqacha boʻladi, eskisi arxivga
        tushadi.

        Arxivlash faqat ``archive=True`` bilan: adminning tasdigʻisiz kursni
        koʻzdan yoʻqotish jurnalni ham yashiradi.
        """
        from app.modules.course.course.repository import get_course_repository

        plan_set = await self.build(session)

        # Chegaradan oshgan arxivlash — odatda yuklama toʻliq yuklanmaganining
        # belgisi. Hech nima yozilmasdan toʻxtaydi: yaratishni ham qilib
        # qoʻyib keyin toʻxtash yarim bajarilgan progon boʻlardi.
        if archive and plan_set.archive and plan_set.archive_blocked:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"{len(plan_set.archive)} ta kurs arxivga tushmoqchi — bu juda koʻp. "
                    "Odatda bu yuklama toʻliq yuklanmaganini bildiradi. Avval yuklamani "
                    "qayta import qiling."
                ),
            )

        created = 0
        restored = 0
        archived = 0
        moved_groups = 0

        for plan in plan_set.plans:
            if plan.exists:
                continue

            if plan.archived:
                course = await session.scalar(
                    select(Course).where(
                        Course.external_source == SOURCE_EDUPLAN,
                        Course.external_id == plan.external_id,
                    )
                )
                if course is not None:
                    course.is_active = True
                    course.synced_at = func.now()
                    plan.archived = False
                    plan.exists = True
                    restored += 1
                continue

            if plan.education_language == LANG_RUSSIAN:
                moved = await self._detach_from_mixed_course(session, plan)
                if moved is None:
                    continue
                moved_groups += moved

            name = await get_course_repository._build_course_name(
                session, plan.subject_id, plan.group_ids, plan.semester_number, plan.course_type
            )
            faculty_id, kafedra_id, speciality_id = await get_course_repository._derive_org_fields(
                session, plan.subject_id, plan.group_ids
            )

            course = Course(
                name=name,
                subject_id=plan.subject_id,
                teacher_id=plan.teacher_user_id,
                course_type=plan.course_type,
                semester_number=plan.semester_number,
                faculty_id=faculty_id,
                kafedra_id=kafedra_id,
                speciality_id=speciality_id,
                external_source=SOURCE_EDUPLAN,
                external_id=plan.external_id,
                synced_at=func.now(),
            )
            session.add(course)
            await session.flush()

            for group_id in plan.group_ids:
                session.add(CourseGroup(course_id=course.id, group_id=group_id))

            session.add(CourseTeacher(course_id=course.id, user_id=plan.teacher_user_id, role=ROLE_MAIN))

            plan.exists = True
            created += 1

        if archive and plan_set.archive:
            for row in plan_set.archive:
                course = await session.get(Course, row.course_id)
                if course is not None and course.is_active:
                    course.is_active = False
                    archived += 1
            plan_set.archive = []

        await session.commit()
        logger.info(
            "EduPlan: %d ta kurs yaratildi, %d tasi tiklandi, %d tasi arxivga tushdi, "
            "%d ta rus guruhi aralash kursdan koʻchirildi",
            created,
            restored,
            archived,
            moved_groups,
        )

        plan_set.created = created
        plan_set.restored = restored
        plan_set.archived = archived
        plan_set.moved_groups = moved_groups
        return plan_set


eduplan_course_builder = EduPlanCourseBuilder()
