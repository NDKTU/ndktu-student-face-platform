"""Массовый импорт студентов из административного API HEMIS.

Отличие от поштучного `hemis_service`: тот работает по логину и паролю самого
студента и вызывается при входе, а этот ходит по служебному токену и
обновляет весь справочник.

Правила, за которыми стоят конкретные грабли:

* **Ключ сопоставления — `student_id_number`.** У всех наших студентов он
  уникален и совпадает с `username`; идентификаторы HEMIS (`id`, `meta_id`)
  меняются между системами, номер студента — нет.
* **Группы не создаются.** Оргструктура — зеркало EPOS, и HEMIS в ней ничего
  не заводит. Если группа ещё не привязана (`groups.hemis_group_id`), студент
  импортируется без группы и попадает в отчёт.
* **Существующую группу не обнуляем.** Непривязанная группа HEMIS — это наша
  недоделка в сопоставлении, а не повод отобрать у студента группу, которая
  уже проставлена.
* **Пустое значение из HEMIS ничего не затирает.** Списочный API беднее
  личного `/account/me`: `phone` в нём `null`, а `avg_gpa` — ноль у всех.
  Безусловная запись стёрла бы тысячи телефонов и средних баллов, которые
  приехали при входе студентов. Правило общее для всех полей, см. `_merge`.
* **Никого не деактивируем.** Мы запрашиваем только активных, поэтому
  «пропал из выдачи» ≠ «отчислен»: под это попадёт и обрыв связи. Такие
  студенты показываются списком, решает администратор.
"""

import logging
import secrets
from datetime import date, datetime

from fastapi import HTTPException, status
from sqlalchemy import insert, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.mixins.time_stamp_mixin import utcnow_naive
from app.core.utils.password_hash import hash_password_async
from app.modules.auth.model import Role, Student, User, UserRole
from app.modules.organization_structure.model import Faculty, Group

from . import data_credentials
from .data_client import HemisDataClient
from .schemas import StudentSyncApplyRequest, StudentSyncApplyResponse, StudentSyncPreviewResponse

logger = logging.getLogger(__name__)

#: Сколько строк пишем между коммитами. 9 тысяч в одной транзакции — это
#: долгий эксклюзивный замок на `students`; порциями и безопаснее, и видно
#: прогресс в логе.
CHUNK = 500

#: Выше этого числа создаваемых записей apply требует явного подтверждения.
#: Первое наполнение (≈6200 человек) — законный случай, но он должен быть
#: осознанным нажатием, а не побочным эффектом ночного прогона.
BULK_CREATE_THRESHOLD = 500

#: Дата, которую `_birth_date` ставит вместо неразобранной. Значение-заглушка,
#: и перезаписывать ею настоящую дату рождения нельзя.
UNKNOWN_BIRTH_DATE = date(1970, 1, 1)


def _text(value) -> str:
    """HEMIS отдаёт справочники объектами `{code, name}`, иногда строкой."""
    if isinstance(value, dict):
        return value.get("name") or ""
    return value if isinstance(value, str) else ""


def _birth_date(timestamp) -> date:
    try:
        return datetime.fromtimestamp(int(timestamp)).date() if timestamp else UNKNOWN_BIRTH_DATE
    except (OSError, OverflowError, ValueError, TypeError):
        return UNKNOWN_BIRTH_DATE


def _float(value) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _faculty(item: dict, group_faculty: str) -> str:
    """Факультет студента.

    Первый источник — факультет нашей группы: он приехал из EPOS и написан так,
    как принято у нас. Если группа ещё не привязана, берём HEMIS: факультет
    лежит в `department` (`structureType` = «Fakultet»), а не в `faculty` —
    последнее поле в выдаче пустое. Раньше здесь оставалась пустая строка, и
    каждый прогон стирал факультет всем, чья группа не сопоставлена.
    """
    if group_faculty:
        return group_faculty
    return _text(item.get("department")) or _text(item.get("faculty"))


def _fields(item: dict, faculty_name: str) -> dict:
    """Строка HEMIS → колонки `students`.

    Имя разбирается по тем же правилам, что и в поштучной синхронизации:
    первое слово — фамилия. Отдельные `first_name`/`second_name` в выдаче есть,
    но их порядок в HEMIS не совпадает с нашим, и смешивать два разбора хуже,
    чем держать один.

    `image` — обрезанный портрет 320×320, ровно то, что уже лежит у студентов
    и что уходит эталоном в распознавание лиц. `image_full` (исходный файл
    целиком) берётся только как запасной вариант: подменять им эталон всей
    базе означало бы заново проверять качество распознавания.
    """
    full_name = item.get("full_name") or ""
    parts = full_name.split()
    return {
        "full_name": full_name,
        "first_name": parts[1] if len(parts) > 1 else "",
        "last_name": parts[0] if parts else "",
        "third_name": " ".join(parts[2:]) if len(parts) > 2 else "",
        "student_id_number": item.get("student_id_number") or "",
        "image_path": item.get("image") or item.get("image_full") or "",
        "birth_date": _birth_date(item.get("birth_date")),
        "phone": item.get("phone") or "",
        "gender": _text(item.get("gender")),
        "university": _text(item.get("university")),
        "specialty": _text(item.get("specialty")),
        "student_status": _text(item.get("studentStatus")),
        "education_form": _text(item.get("educationForm")),
        "education_type": _text(item.get("educationType")),
        "payment_form": _text(item.get("paymentForm")),
        "education_lang": _text((item.get("group") or {}).get("educationLang")),
        "faculty": _faculty(item, faculty_name),
        "level": _text(item.get("level")),
        "semester": _text(item.get("semester")),
        "address": _text(item.get("district")) or _text(item.get("province")),
        "avg_gpa": _float(item.get("avg_gpa")),
    }


def _is_blank(value) -> bool:
    """«Данных нет» — в отличие от «данные изменились».

    Ноль для `avg_gpa` и 1970 год для даты рождения — такие же заглушки, как
    пустая строка: списочный API просто не отдаёт эти поля.
    """
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value == 0
    return value == UNKNOWN_BIRTH_DATE


def _merge(student: Student, fields: dict) -> None:
    """Обновляет строку, не затирая известное неизвестным.

    Личный кабинет студента (`/account/me`) богаче служебного списка, и то, что
    оттуда однажды приехало, должно пережить ночной прогон.
    """
    for key, value in fields.items():
        if _is_blank(value) and not _is_blank(getattr(student, key, None)):
            continue
        setattr(student, key, value)


class HemisStudentSync:
    async def _client(self, session: AsyncSession) -> HemisDataClient:
        url, token = await data_credentials.effective(session)
        return HemisDataClient(url, token)

    async def _group_map(self, session: AsyncSession) -> dict[str, tuple[int, str]]:
        """`hemis_group_id` → (наш id группы, имя факультета)."""
        rows = await session.execute(
            select(Group.hemis_group_id, Group.id, Group.faculty_id).where(
                Group.hemis_group_id.is_not(None)
            )
        )
        groups = {str(hgid): (gid, fid) for hgid, gid, fid in rows}
        if not groups:
            return {}

        faculty_ids = {fid for _, fid in groups.values() if fid}
        faculty_names = {
            fid: name
            for fid, name in await session.execute(
                select(Faculty.id, Faculty.name).where(Faculty.id.in_(faculty_ids))
            )
        }
        return {
            hgid: (gid, faculty_names.get(fid, ""))
            for hgid, (gid, fid) in groups.items()
        }

    async def _classify(
        self, session: AsyncSession, items: list[dict], incremental: bool = False
    ) -> dict:
        group_map = await self._group_map(session)

        existing = {
            sid: sid_id
            for sid, sid_id in await session.execute(
                select(Student.student_id_number, Student.id)
            )
        }

        # Записи без номера пропускаем — сопоставлять их не по чему. Повтор
        # номера в одной выдаче — авария на той стороне, но уникальный индекс
        # отверг бы обе строки и оборвал весь прогон, поэтому оставляем
        # последнюю: она свежее.
        unique: dict[str, dict] = {}
        for item in items:
            sid = item.get("student_id_number")
            if sid:
                unique[sid] = item

        to_create, to_update, no_group = [], [], []
        for sid, item in unique.items():
            hemis_group = str((item.get("group") or {}).get("id") or "")
            if hemis_group not in group_map:
                no_group.append(sid)
            (to_update if sid in existing else to_create).append(item)

        # При инкрементальном прогоне выдача — лишь изменившиеся, и «нет в
        # ответе» ничего не значит. Считать пропавших можно только по полной
        # выборке, иначе список был бы почти всей базой.
        missing = [] if incremental else sorted(set(existing) - set(unique))
        return {
            "group_map": group_map,
            "create": to_create,
            "update": to_update,
            "no_group": no_group,
            "missing": missing,
            "skipped": len(items) - len(unique),
        }

    async def preview(self, session: AsyncSession) -> StudentSyncPreviewResponse:
        client = await self._client(session)
        items = await client.fetch_all()
        await data_credentials.mark_ok(session)

        plan = await self._classify(session, items)
        return StudentSyncPreviewResponse(
            hemis_total=len(items),
            create_count=len(plan["create"]),
            update_count=len(plan["update"]),
            no_group_count=len(plan["no_group"]),
            missing_locally=len(plan["missing"]),
            linked_groups=len(plan["group_map"]),
            missing_examples=plan["missing"][:20],
            needs_bulk_confirm=len(plan["create"]) > BULK_CREATE_THRESHOLD,
        )

    def _row(self, item: dict, group_map: dict[str, tuple[int, str]]) -> tuple[dict, int | None]:
        """Поля студента и id группы для одной записи HEMIS."""
        hemis_group = str((item.get("group") or {}).get("id") or "")
        group_id, faculty_name = group_map.get(hemis_group, (None, ""))
        return _fields(item, faculty_name), group_id

    async def _student_role_id(self, session: AsyncSession) -> int:
        """id роли `student`; заводим, если её ещё нет."""
        role_id = (
            await session.execute(select(Role.id).where(Role.name == "student"))
        ).scalar_one_or_none()
        if role_id is None:
            role = Role(name="student")
            session.add(role)
            await session.flush()
            role_id = role.id
        return role_id

    async def _create_chunk(
        self,
        session: AsyncSession,
        items: list[dict],
        group_map: dict[str, tuple[int, str]],
        user_ids: dict[str, int],
        role_id: int,
        password_hash: str,
    ) -> int:
        """Заводит недостающих пользователей и студентов одной пачкой.

        Пакетная вставка вместо ORM-объектов по одному — не украшательство:
        первое наполнение это ≈6200 человек, и поштучный путь (bcrypt на
        каждого плюс несколько запросов на выдачу роли) занимал десятки минут,
        не укладываясь ни в один разумный таймаут.
        """
        # Учётка могла остаться от прежнего входа, а строки студента при этом
        # не быть. Роль у такого человека надо проверить отдельно: у только
        # что заведённых она ставится вместе с ними.
        known = [
            user_ids[item["student_id_number"]]
            for item in items
            if item["student_id_number"] in user_ids
        ]
        await self._ensure_role(session, known, role_id)

        missing = [
            item["student_id_number"]
            for item in items
            if item["student_id_number"] not in user_ids
        ]
        if missing:
            created = await session.execute(
                insert(User).returning(User.id, User.username),
                [
                    {"username": sid, "password": password_hash, "auth_source": "hemis"}
                    for sid in missing
                ],
            )
            fresh = {username: uid for uid, username in created}
            user_ids.update(fresh)
            await session.execute(
                insert(UserRole),
                [{"user_id": uid, "role_id": role_id} for uid in fresh.values()],
            )

        rows = []
        for item in items:
            fields, group_id = self._row(item, group_map)
            rows.append(
                {**fields, "group_id": group_id, "user_id": user_ids[item["student_id_number"]]}
            )
        await session.execute(insert(Student), rows)
        return len(rows)

    async def _ensure_role(
        self, session: AsyncSession, user_ids: list[int], role_id: int
    ) -> None:
        """Доводит роль `student` тем, у кого её ещё нет.

        Раньше это делал `ensure_role` внутри цикла — он трогал `user.roles`
        у пользователя, загруженного без `selectinload`, и весь прогон падал
        с `MissingGreenlet` на первом же таком человеке.
        """
        if not user_ids:
            return
        have = set(
            (
                await session.execute(
                    select(UserRole.user_id).where(
                        UserRole.role_id == role_id, UserRole.user_id.in_(user_ids)
                    )
                )
            )
            .scalars()
            .all()
        )
        missing = [uid for uid in user_ids if uid not in have]
        if missing:
            await session.execute(
                insert(UserRole), [{"user_id": uid, "role_id": role_id} for uid in missing]
            )

    async def apply(
        self, session: AsyncSession, data: StudentSyncApplyRequest
    ) -> StudentSyncApplyResponse:
        # Hech bir toifa tanlanmagan bo'lsa, HEMIS'ga bormaymiz: 49 sahifani
        # aylanib chiqib, keyin hammasini tashlab yuborish bir necha daqiqani
        # behuda sarflardi.
        if not (data.include_create or data.include_update):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Hech bo'lmasa bitta toifa tanlanishi kerak: yangilar yoki yangilanadiganlar",
            )

        client = await self._client(session)

        since: datetime | None = None
        if data.incremental:
            row = await data_credentials.load_row(session)
            since = row.last_student_sync_at if row else None

        started_at = utcnow_naive()
        items = await client.fetch_all(
            updated_at_from=int(since.timestamp()) if since else None
        )
        await data_credentials.mark_ok(session)

        plan = await self._classify(session, items, incremental=since is not None)
        group_map = plan["group_map"]

        # Adminning uchta belgisi. Toifalar kesishadi: guruhsiz talaba ayni
        # paytda yangi yoki yangilanadigan ham bo'ladi, shuning uchun
        # «guruhsiz» belgisi olib tashlansa, ular ikkala ro'yxatdan ham
        # chiqariladi — aks holda belgi hech narsani o'zgartirmagan bo'lardi.
        no_group = set(plan["no_group"])
        excluded = 0

        def keep(item: dict) -> bool:
            sid = item.get("student_id_number") or ""
            return data.include_no_group or sid not in no_group

        if not data.include_no_group:
            before = len(plan["create"]) + len(plan["update"])
            plan["create"] = [i for i in plan["create"] if keep(i)]
            plan["update"] = [i for i in plan["update"] if keep(i)]
            excluded += before - len(plan["create"]) - len(plan["update"])

        if not data.include_create:
            excluded += len(plan["create"])
            plan["create"] = []

        if not data.include_update:
            excluded += len(plan["update"])
            plan["update"] = []

        if len(plan["create"]) > BULK_CREATE_THRESHOLD and not data.allow_bulk_create:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"{len(plan['create'])} ta yangi talaba yaratiladi — bu ommaviy o'zgarish. "
                    "Tasdiqlash uchun 'allow_bulk_create' bilan yuboring."
                ),
            )

        # Пароля у нас нет и быть не может: вход этих людей идёт проверкой в
        # HEMIS. Ставим случайный — один на весь прогон, чтобы не платить
        # bcrypt'ом за каждого из тысяч. Открытый текст нигде не сохраняется и
        # никому не выдаётся, поэтому одинаковый хеш ничего не открывает.
        password_hash = await hash_password_async(secrets.token_urlsafe(32))
        role_id = await self._student_role_id(session)

        created = updated = 0
        # Записи, которые `_classify` отбросил: без номера или его повтор.
        skipped = plan["skipped"]

        to_create = plan["create"]
        if to_create:
            user_ids = {
                username: uid
                for uid, username in await session.execute(select(User.id, User.username))
            }
            for start in range(0, len(to_create), CHUNK):
                chunk = to_create[start : start + CHUNK]
                created += await self._create_chunk(
                    session, chunk, group_map, user_ids, role_id, password_hash
                )
                await session.commit()
                logger.info("HEMIS student sync: yaratildi %s / %s", created, len(to_create))

        to_update = {item["student_id_number"]: item for item in plan["update"]}
        if to_update:
            students = (
                (
                    await session.execute(
                        select(Student).where(Student.student_id_number.in_(to_update))
                    )
                )
                .scalars()
                .all()
            )
            touched_users: list[int] = []
            for index, student in enumerate(students, start=1):
                item = to_update.get(student.student_id_number)
                if item is None:
                    continue
                fields, group_id = self._row(item, group_map)
                _merge(student, fields)
                # Группу трогаем только когда знаем её: иначе непривязанная
                # группа HEMIS отобрала бы у студента уже проставленную.
                if group_id is not None:
                    student.group_id = group_id
                if student.user_id:
                    touched_users.append(student.user_id)
                updated += 1
                if index % CHUNK == 0:
                    await session.commit()
                    logger.info("HEMIS student sync: yangilandi %s / %s", index, len(students))

            await self._ensure_role(session, touched_users, role_id)

        await session.commit()

        # Метку двигаем на момент НАЧАЛА прогона: изменения, случившиеся во
        # время двухминутного обхода, попадут в следующий запуск, а не
        # потеряются между окнами.
        row = await data_credentials.ensure_row(session)
        row.last_student_sync_at = started_at
        await session.commit()

        logger.info("HEMIS student sync tugadi: +%s, ~%s", created, updated)

        return StudentSyncApplyResponse(
            incremental=since is not None,
            fetched=len(items),
            created=created,
            updated=updated,
            skipped=skipped,
            excluded=excluded,
            no_group=len(plan["no_group"]),
            missing_locally=len(plan["missing"]),
        )


hemis_student_sync = HemisStudentSync()
