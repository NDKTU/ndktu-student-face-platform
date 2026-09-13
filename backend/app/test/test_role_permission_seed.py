"""O'qituvchi va talaba rollariga ruxsatlarning ishga tushishda berilishi.

Bu mantiq har ishga tushishda bajariladi va buzilganda jimgina sodir
bo'ladi: rol kamchil qoladi, foydalanuvchi esa faqat "403" ko'radi va
sababini bilmaydi. Shuning uchun uchta va'da testda qotirilgan:

* bo'sh rolga ro'yxat to'liq beriladi (va rol yo'q bo'lsa yaratiladi);
* takroriy ishga tushish dublikat yaratmaydi;
* qo'lda berilgan qo'shimcha ruxsat OLIB TASHLANMAYDI.
"""

import pytest
from sqlalchemy import delete, func, select

from app.core.lifespan.assignment import assign_admin_permissions, seed_role_permissions
from app.core.lifespan.permissions import sync_permissions
from app.core.lifespan.defaults import (
    SEEDED_ROLE_PERMISSIONS,
    STUDENT_PERMISSIONS,
    TEACHER_PERMISSIONS,
)
from app.modules.auth.model import Permission, Role, RolePermission


async def _all_permissions(session) -> dict[str, Permission]:
    """Ro'yxatdagi barcha nomlar uchun `Permission` qatorlarini yaratadi.

    Haqiqiy hayotda ular route'lardan topiladi (`discovery.py`); testda
    esa aynan ro'yxatning o'zidan yasaymiz — bizni qiziqtirgan narsa
    biriktirish mantiqi, topish emas.
    """
    names = {name for perms in SEEDED_ROLE_PERMISSIONS.values() for name in perms}
    session.add_all(Permission(name=name) for name in sorted(names))
    await session.flush()
    return {
        p.name: p for p in (await session.execute(select(Permission))).scalars().all()
    }


async def _role_permission_names(session, role_name: str) -> set[str]:
    return set(
        (
            await session.execute(
                select(Permission.name)
                .join(RolePermission, RolePermission.permission_id == Permission.id)
                .join(Role, Role.id == RolePermission.role_id)
                .where(Role.name == role_name)
            )
        )
        .scalars()
        .all()
    )


@pytest.mark.asyncio
async def test_admin_gets_existing_and_new_permissions_without_replacing_links(async_db):
    admin = Role(name="Admin")
    existing = Permission(name="read:existing")
    assigned = Permission(name="read:assigned")
    async_db.add_all([admin, existing, assigned])
    await async_db.flush()
    link = RolePermission(role_id=admin.id, permission_id=assigned.id)
    async_db.add(link)
    await async_db.commit()

    # Even when discovery is empty, existing database permissions are granted.
    perms = await sync_permissions(async_db, set())
    await assign_admin_permissions(async_db, perms, admin)
    assert await _role_permission_names(async_db, "Admin") == {"read:existing", "read:assigned"}

    # A new endpoint permission is picked up on the next startup.
    perms = await sync_permissions(async_db, {"read:new_feature"})
    await assign_admin_permissions(async_db, perms, admin)
    before = set((await async_db.execute(select(
        RolePermission.id, RolePermission.role_id, RolePermission.permission_id,
    ))).all())
    await assign_admin_permissions(async_db, perms, admin)
    after = set((await async_db.execute(select(
        RolePermission.id, RolePermission.role_id, RolePermission.permission_id,
    ))).all())

    assert before == after
    assert (link.id, admin.id, assigned.id) in after
    assert len(after) == 3
    assert await _role_permission_names(async_db, "Admin") == {
        "read:existing", "read:assigned", "read:new_feature",
    }


@pytest.mark.asyncio
async def test_missing_roles_are_created_with_their_permissions(async_db):
    """Bo'sh bazada rollar o'zi yaratiladi va to'liq ro'yxat oladi.

    Yangi muhit ko'tarilganda o'qituvchi va talabani qo'lda sozlash kerak
    bo'lmasligi kerak.
    """
    perms = await _all_permissions(async_db)

    await seed_role_permissions(async_db, perms)

    assert await _role_permission_names(async_db, "teacher") == set(TEACHER_PERMISSIONS)
    assert await _role_permission_names(async_db, "student") == set(STUDENT_PERMISSIONS)


@pytest.mark.asyncio
async def test_second_run_adds_nothing(async_db):
    """Takroriy ishga tushish dublikat qator yaratmaydi.

    `role_permissions` da `(role_id, permission_id)` unikalligi YO'Q, ya'ni
    dublikat xato bermaydi — jimgina to'planib boradi. Shuning uchun
    sonini aniq tekshiramiz.
    """
    perms = await _all_permissions(async_db)

    await seed_role_permissions(async_db, perms)
    before = await async_db.scalar(select(func.count()).select_from(RolePermission))

    await seed_role_permissions(async_db, perms)
    after = await async_db.scalar(select(func.count()).select_from(RolePermission))

    assert before == after == len(TEACHER_PERMISSIONS) + len(STUDENT_PERMISSIONS)


@pytest.mark.asyncio
async def test_manually_granted_permission_survives(async_db):
    """Admin qo'lda bergan qo'shimcha huquq keyingi ishga tushishda qoladi.

    Aks holda «kechqurun ruxsat berdim, ertalab yo'q» degan holat chiqardi.
    `read:file` ataylab tanlangan: u talabaning ro'yxatida YO'Q (lekin
    o'qituvchining ro'yxatida bor, ya'ni `Permission` qatori allaqachon
    mavjud — qaytadan yaratmaymiz).
    """
    perms = await _all_permissions(async_db)
    extra = perms["read:file"]

    await seed_role_permissions(async_db, perms)

    student = (
        await async_db.execute(select(Role).where(Role.name == "student"))
    ).scalar_one()
    async_db.add(RolePermission(role_id=student.id, permission_id=extra.id))
    await async_db.commit()

    await seed_role_permissions(async_db, perms)

    names = await _role_permission_names(async_db, "student")
    assert "read:file" in names
    assert names == set(STUDENT_PERMISSIONS) | {"read:file"}


@pytest.mark.asyncio
async def test_missing_link_is_restored_without_changing_existing_links(async_db):
    perms = await _all_permissions(async_db)
    await seed_role_permissions(async_db, perms)
    student = (
        await async_db.execute(select(Role).where(Role.name == "student"))
    ).scalar_one()
    extra = RolePermission(role_id=student.id, permission_id=perms["read:file"].id)
    async_db.add(extra)
    missing = perms["read:homework"]
    await async_db.execute(
        delete(RolePermission).where(
            RolePermission.role_id == student.id,
            RolePermission.permission_id == missing.id,
        )
    )
    await async_db.commit()
    before = set((await async_db.execute(select(
        RolePermission.id, RolePermission.role_id, RolePermission.permission_id,
    ))).all())

    await seed_role_permissions(async_db, perms)

    after = set((await async_db.execute(select(
        RolePermission.id, RolePermission.role_id, RolePermission.permission_id,
    ))).all())
    assert before <= after
    assert len(after - before) == 1
    assert await _role_permission_names(async_db, "student") == set(STUDENT_PERMISSIONS) | {"read:file"}


@pytest.mark.asyncio
async def test_other_roles_are_untouched(async_db):
    perms = await _all_permissions(async_db)
    role = Role(name="department_head")
    async_db.add(role)
    await async_db.flush()
    async_db.add(RolePermission(role_id=role.id, permission_id=perms["read:file"].id))
    await async_db.commit()

    await seed_role_permissions(async_db, perms)

    assert await _role_permission_names(async_db, "department_head") == {"read:file"}


@pytest.mark.asyncio
async def test_unknown_permission_is_skipped_not_fatal(async_db):
    """Bazada yo'q ruxsat prognni yiqitmaydi, qolganlari beriladi.

    Kod ro'yxati eskirgan bo'lishi mumkin (ruxsat nomi o'zgargan). Bu
    butun ishga tushishni to'xtatmasligi kerak — aks holda ilova
    ko'tarilmay qolardi.
    """
    perms = await _all_permissions(async_db)
    # Ro'yxatda bor, lekin bazada yo'q holatni yasaymiz.
    removed = STUDENT_PERMISSIONS[0]
    perms.pop(removed)

    await seed_role_permissions(async_db, perms)

    names = await _role_permission_names(async_db, "student")
    assert removed not in names
    assert names == set(STUDENT_PERMISSIONS) - {removed}


def test_lists_have_no_duplicates():
    """Ro'yxatda takror nom bo'lsa, u dublikat qatorga aylanardi."""
    for role_name, perms in SEEDED_ROLE_PERMISSIONS.items():
        assert len(perms) == len(set(perms)), role_name


def test_student_has_no_dangerous_permissions():
    """Talabaga boshqalarning ma'lumotini ochadigan ruxsat berilmaydi.

    `read:psychology_results` so'rovdagi `user_id` orqali BOSHQA
    talabalarning natijalarini ham ko'rsatadi; `read:file` esa umumiy
    kutubxonani, ya'ni o'qituvchilarning fayllarini. Ikkovi ham ataylab
    yo'q va tasodifan qo'shilib qolmasligi kerak.
    """
    forbidden = {
        "read:psychology_results",
        "read:file",
        "read:student",
        "read:group",
        "read:question",
    }
    assert forbidden.isdisjoint(STUDENT_PERMISSIONS)


def test_teacher_cannot_manage_users_or_roles():
    """O'qituvchi rol, foydalanuvchi va integratsiyani boshqarmaydi."""
    forbidden = {
        "create:role", "update:role", "delete:role", "read:role",
        "create:user", "update:user", "delete:user", "read:user",
        "read:permission", "sync:eduplan", "hemis_admin_sync",
        # Tashkiliy tuzilmani O'ZGARTIRISH: u EPMOS ko'zgusi va qo'lda
        # tahrir keyingi sinxronizatsiyada jimgina yo'qoladi. O'qish
        # (`read:group`) esa berilgan.
        "create:group", "update:group", "delete:group",
        "create:subject", "update:subject",
        "create:faculty", "update:faculty",
    }
    assert forbidden.isdisjoint(TEACHER_PERMISSIONS), forbidden.intersection(
        TEACHER_PERMISSIONS
    )
