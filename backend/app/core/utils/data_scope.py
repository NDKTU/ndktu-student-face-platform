"""Foydalanuvchi kimning ma'lumotini ko'radi.

Ruxsat (`PermissionRequired`) sahifa va amalni ochadi, doira esa shu
sahifada qaysi satrlar ko'rinishini belgilaydi. Doira turi rolda
(`roles.data_scope`), aniq fakultet/kafedra/guruh esa foydalanuvchida
(`user_data_scopes`) — admin ikkalasini ham interfeysdan sozlaydi.

Bir nechta rol bo'lsa, eng keng doira g'olib: rollar birlashadi, bir-birini
toraytirmaydi. Faol rol tanlanganda (`X-Active-Role`) `user.roles` allaqachon
toraytirilgan, ya'ni o'qituvchi ko'rinishidagi admin o'qituvchi doirasida
ko'radi.

Doira faqat KO'RISHNI cheklaydi. Tahrirlash va o'chirish muallif/egasi
qoidalarida qoladi.
"""

from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.utils.group_scope import teacher_group_ids
from app.modules.auth.model import Student, User, UserDataScope
from app.modules.organization_structure.model import Group, Speciality

SCOPE_ALL = "all"
SCOPE_FACULTY = "faculty"
SCOPE_KAFEDRA = "kafedra"
SCOPE_ASSIGNED_GROUPS = "assigned_groups"
SCOPE_OWN = "own"

#: Kengdan torga. Interfeysdagi tartib ham shu.
DATA_SCOPES = (SCOPE_ALL, SCOPE_FACULTY, SCOPE_KAFEDRA, SCOPE_ASSIGNED_GROUPS, SCOPE_OWN)

ADMIN_ROLE = "admin"


@dataclass(frozen=True)
class DataScope:
    """Hisoblangan doira.

    `group_ids` — fakultet, kafedra va qo'lda biriktirilgan guruhlardan.
    `taught_group_ids` — o'qituvchi dars o'tadigan guruhlar
    (`teacher_group_ids`): test natijalarida ular alohida, torroq qoida bilan
    ishlaydi (guruh + fan), shuning uchun aralashtirilmaydi.
    `kafedra_ids` — muallifga bog'langan ma'lumot uchun (kafedra o'qituvchilari
    tuzgan testlar natijalari).
    Foydalanuvchining o'z ma'lumoti har doim ko'rinadi.
    """

    user_id: int
    unrestricted: bool = False
    group_ids: frozenset[int] = field(default_factory=frozenset)
    taught_group_ids: frozenset[int] = field(default_factory=frozenset)
    kafedra_ids: frozenset[int] = field(default_factory=frozenset)
    teaching: bool = False

    @property
    def visible_group_ids(self) -> frozenset[int]:
        return self.group_ids | self.taught_group_ids

    def sees_group(self, group_id: int | None) -> bool:
        return self.unrestricted or (group_id is not None and group_id in self.visible_group_ids)


async def resolve_data_scope(session: AsyncSession, user: User) -> DataScope:
    roles = list(user.roles or [])
    names = {role.name.lower() for role in roles}
    scopes = {(role.data_scope or SCOPE_OWN) for role in roles}

    if ADMIN_ROLE in names or SCOPE_ALL in scopes:
        return DataScope(user_id=user.id, unrestricted=True)

    bindings = (
        await session.execute(
            select(UserDataScope.faculty_id, UserDataScope.kafedra_id, UserDataScope.group_id).where(
                UserDataScope.user_id == user.id
            )
        )
    ).all()
    faculty_ids = {row.faculty_id for row in bindings if row.faculty_id is not None}
    kafedra_ids = {row.kafedra_id for row in bindings if row.kafedra_id is not None}
    bound_group_ids = {row.group_id for row in bindings if row.group_id is not None}

    group_ids: set[int] = set()
    if SCOPE_FACULTY in scopes and faculty_ids:
        group_ids.update(
            (await session.execute(select(Group.id).where(Group.faculty_id.in_(faculty_ids)))).scalars()
        )
    if SCOPE_KAFEDRA in scopes and kafedra_ids:
        # Kafedra guruhlari mutaxassislik orqali: guruhda kafedra ustuni yo'q.
        group_ids.update(
            (
                await session.execute(
                    select(Group.id)
                    .join(Speciality, Speciality.id == Group.speciality_id)
                    .where(Speciality.kafedra_id.in_(kafedra_ids))
                )
            ).scalars()
        )
    else:
        kafedra_ids = set()

    teaching = SCOPE_ASSIGNED_GROUPS in scopes
    taught: set[int] = set()
    if teaching:
        group_ids.update(bound_group_ids)
        taught = await teacher_group_ids(session, user.id)

    return DataScope(
        user_id=user.id,
        group_ids=frozenset(group_ids),
        taught_group_ids=frozenset(taught),
        kafedra_ids=frozenset(kafedra_ids),
        teaching=teaching,
    )


async def sees_user(session: AsyncSession, scope: DataScope, user_id: int | None) -> bool:
    """Shu foydalanuvchining (talabaning) ma'lumoti doirada-mi.

    Bitta foydalanuvchiga bir nechta talaba yozuvi bog'langan bo'lishi
    mumkin — guruhlaridan biri doirada bo'lsa yetarli.
    """
    if scope.unrestricted or user_id == scope.user_id:
        return True
    if user_id is None or not scope.visible_group_ids:
        return False
    found = await session.execute(
        select(Student.id)
        .where(Student.user_id == user_id, Student.group_id.in_(scope.visible_group_ids))
        .limit(1)
    )
    return found.first() is not None
