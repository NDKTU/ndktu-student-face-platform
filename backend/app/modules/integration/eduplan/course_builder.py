"""EPOS yuklamasidan kurslarni yigʻish.

Kurs — bu ``(fan, semestr, maʼruzachi)`` uchligi. Maʼruza oʻqiydigan
oʻqituvchi kursning asosiysi boʻladi, uning oʻsha fan va semestrdagi barcha
guruhlari bitta kursga yigʻiladi, oʻsha guruhlarda amaliyot yoki laboratoriya
olib boradigan qolgan oʻqituvchilar assistent boʻlib qoʻshiladi.

Nega har guruhga alohida kurs emas: maʼruza bitta oqimga oʻqilsa ham nechta
guruh boʻlsa shuncha kurs paydo boʻlardi, oʻqituvchi bir xil darsni bir necha
joyda yuritishi kerak boʻlardi va natijalar boʻlinib ketardi. EPOS'dagi oqim
(``stream_id``) tushunchasi ham aynan shuning uchun bor.

Maʼruzachisi yoʻq guruhlardan kurs yasalmaydi — ular roʻyxatga chiqadi va
qarorni admin qabul qiladi. Tasodifiy birinchi oʻqituvchini asosiy qilib
qoʻyish jimgina notoʻgʻri javob berardi: u kursni oʻchira va boshqa
oʻqituvchilarni qoʻsha olardi.

Ikki bosqichli: ``build`` hech narsa yozmaydi, ``apply`` yaratadi. Jimgina
yuzlab kurs yaratish — «206 guruh dublikat» tuzogʻining aynan oʻzi.
"""

import logging
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utils.course_access import ROLE_ASSISTANT, ROLE_MAIN
from app.modules.auth.model import Teacher, TeacherAssignment
from app.modules.course.model import Course, CourseGroup, CourseTeacher
from app.modules.organization_structure.model import Group
from app.modules.quiz.model import Subject

from .schemas import CoursePlan, CoursePreviewResponse, CourseSkipped

logger = logging.getLogger(__name__)

SOURCE_EDUPLAN = "eduplan"

#: Maʼruza oʻqiyotgan oʻqituvchi kursning asosiysi boʻladi.
#: EPOS interfeysda «Ma'ruza» koʻrsatadi, API'da esa inglizcha kod qaytaradi.
#: Oʻzbekcha soʻz boʻyicha izlaganda hech nima mos kelmasdi va hamma kurs
#: «maʼruzachisiz» deb chetga chiqib ketardi.
LECTURE = "lecture"

#: EPOS «Kuzgi»/«Bahorgi» beradi, bizda semestr — son. ``SEMESTER_LABELS``
#: ham aynan shu juftlik: ``{1: "kuzgi", 2: "bahorgi"}``.
SEMESTER_BY_TYPE = {"Kuzgi": 1, "Bahorgi": 2}

#: Bitta biriktirmada ikkala semestr ham uchraydi — ``workload_service``
#: bir nechta yuklama satrini yigʻganda ``semester_type`` ni vergul bilan
#: birlashtiradi («Bahorgi, Kuzgi», lokal maʼlumotda 374 tadan 42 tasi).
#: Bunday kursga bitta semestr raqamini yozib boʻlmaydi — maydon boʻsh
#: qoladi, nomida ham semestr koʻrsatilmaydi.
SEMESTER_SLUG = {1: "1", 2: "2"}


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
    ) -> str:
        """Kursning barqaror kaliti — takroriy prognda dublikat boʻlmasligi uchun.

        EPOS'da kurs degan obyekt yoʻq, shuning uchun id'ni oʻzimiz yigʻamiz.
        Fan uchun uning EPOS id'si olinadi: lokal id fan qayta yaratilsa
        oʻzgarib ketardi va oʻsha kurs ikkinchi marta yaratilardi. Semestr ham
        kalitda — bir oʻqituvchi bitta fanni ikkala semestrda oʻqishi mumkin,
        va bu ikki xil kurs.
        """
        subject_key = subject.external_id or f"local{subject.id}"
        semester_key = SEMESTER_SLUG.get(semester_number or 0, "x")
        return f"{academic_year_id or 0}:{subject_key}:{teacher_user_id}:{semester_key}"

    async def build(self, session: AsyncSession) -> CoursePreviewResponse:
        assignments = list(
            await session.scalars(select(TeacherAssignment).where(TeacherAssignment.is_active.is_(True)))
        )
        if not assignments:
            return CoursePreviewResponse(plans=[], skipped=[])

        teachers = {
            t.id: t
            for t in await session.scalars(select(Teacher).where(Teacher.id.in_({a.teacher_id for a in assignments})))
        }
        subjects = {
            s.id: s
            for s in await session.scalars(select(Subject).where(Subject.id.in_({a.subject_id for a in assignments})))
        }
        group_names = dict(
            (
                await session.execute(
                    select(Group.id, Group.name).where(Group.id.in_({a.group_id for a in assignments}))
                )
            ).all()
        )

        # (fan, semestr) -> maʼruzachi -> guruhlar
        lecture_groups: dict[tuple[int, str | None], dict[int, set[int]]] = defaultdict(lambda: defaultdict(set))
        # (fan, semestr, guruh) -> oʻqituvchilar: assistentlar shu yerdan topiladi
        slot_teachers: dict[tuple[int, str | None, int], set[int]] = defaultdict(set)
        # (fan, semestr) -> oʻquv yili
        academic_years: dict[tuple[int, str | None], int | None] = {}

        for a in assignments:
            slot = (a.subject_id, a.semester_type)
            slot_teachers[(a.subject_id, a.semester_type, a.group_id)].add(a.teacher_id)
            academic_years.setdefault(slot, a.academic_year_id)
            if a.load_types and LECTURE in a.load_types:
                lecture_groups[slot][a.teacher_id].add(a.group_id)

        existing = set(
            await session.scalars(select(Course.external_id).where(Course.external_source == SOURCE_EDUPLAN))
        )

        plans: list[CoursePlan] = []
        covered: set[tuple[int, str | None, int]] = set()

        for slot, by_teacher in lecture_groups.items():
            subject_id, semester_type = slot
            subject = subjects.get(subject_id)
            if subject is None:
                continue

            semester_number = SEMESTER_BY_TYPE.get(semester_type or "")
            academic_year_id = academic_years.get(slot)

            for teacher_id, groups in by_teacher.items():
                teacher = teachers.get(teacher_id)
                if teacher is None:
                    continue

                assistants: set[int] = set()
                for group_id in groups:
                    covered.add((subject_id, semester_type, group_id))
                    for other_id in slot_teachers[(subject_id, semester_type, group_id)]:
                        other = teachers.get(other_id)
                        if other is not None and other.user_id != teacher.user_id:
                            assistants.add(other.user_id)

                key = self._external_key(academic_year_id, subject, teacher.user_id, semester_number)
                ordered_groups = sorted(groups, key=lambda g: group_names.get(g, ""))

                plans.append(
                    CoursePlan(
                        external_id=key,
                        exists=key in existing,
                        subject_id=subject_id,
                        subject_name=subject.name,
                        teacher_user_id=teacher.user_id,
                        teacher_name=teacher.full_name,
                        semester_type=semester_type,
                        semester_number=semester_number,
                        academic_year_id=academic_year_id,
                        group_ids=ordered_groups,
                        group_names=[group_names.get(g, str(g)) for g in ordered_groups],
                        assistant_user_ids=sorted(assistants),
                    )
                )

        # Maʼruzachisi topilmagan guruhlar. Hisob guruh darajasida: bitta fanda
        # bir oqimga maʼruzachi boʻlib, ikkinchisiga boʻlmasligi odatiy hol.
        missing: dict[tuple[int, str | None], list[str]] = defaultdict(list)
        for subject_id, semester_type, group_id in slot_teachers:
            if (subject_id, semester_type, group_id) in covered:
                continue
            missing[(subject_id, semester_type)].append(group_names.get(group_id, str(group_id)))

        skipped = [
            CourseSkipped(
                subject_id=subject_id,
                subject_name=subjects[subject_id].name,
                semester_type=semester_type,
                group_names=sorted(names),
                reason="Maʼruza oʻqiydigan oʻqituvchi biriktirilmagan",
            )
            for (subject_id, semester_type), names in missing.items()
            if subject_id in subjects
        ]

        plans.sort(key=lambda p: (p.subject_name, p.teacher_name or ""))
        skipped.sort(key=lambda s: s.subject_name)

        return CoursePreviewResponse(plans=plans, skipped=skipped)

    # ------------------------------------------------------------------ #
    #  Yaratish
    # ------------------------------------------------------------------ #
    async def apply(self, session: AsyncSession) -> CoursePreviewResponse:
        """Hali yaratilmagan kurslarni yaratadi va yangilangan rejani qaytaradi.

        Faqat yaratadi. Mavjud kursning oʻqituvchisini almashtirish yoki uni
        oʻchirish avtomatik qilinmaydi: kursga darslar, materiallar, uy
        vazifalari va natijalar bogʻlangan — bu adminning qarori.
        """
        from app.modules.course.course.repository import get_course_repository

        plan_set = await self.build(session)
        created = 0

        for plan in plan_set.plans:
            if plan.exists:
                continue

            name = await get_course_repository._build_course_name(
                session, plan.subject_id, plan.group_ids, plan.semester_number
            )
            faculty_id, kafedra_id, speciality_id = await get_course_repository._derive_org_fields(
                session, plan.subject_id, plan.group_ids
            )

            course = Course(
                name=name,
                subject_id=plan.subject_id,
                teacher_id=plan.teacher_user_id,
                semester_number=plan.semester_number,
                faculty_id=faculty_id,
                kafedra_id=kafedra_id,
                speciality_id=speciality_id,
                external_source=SOURCE_EDUPLAN,
                external_id=plan.external_id,
            )
            session.add(course)
            await session.flush()

            for group_id in plan.group_ids:
                session.add(CourseGroup(course_id=course.id, group_id=group_id))

            session.add(CourseTeacher(course_id=course.id, user_id=plan.teacher_user_id, role=ROLE_MAIN))
            for user_id in plan.assistant_user_ids:
                session.add(CourseTeacher(course_id=course.id, user_id=user_id, role=ROLE_ASSISTANT))

            plan.exists = True
            created += 1

        await session.commit()
        logger.info("EduPlan: %d ta kurs yaratildi", created)

        plan_set.created = created
        return plan_set


eduplan_course_builder = EduPlanCourseBuilder()
