import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.modules.auth.permission.model import Permission
from app.modules.auth.role.model import Role


@pytest_asyncio.fixture
async def setup_permissions_for_assignment(async_db):
    # Ensure permissions exist
    perms = ["perm:read", "perm:write", "perm:delete"]
    db_perms = []
    for name in perms:
        stmt = select(Permission).where(Permission.name == name)
        res = await async_db.execute(stmt)
        perm = res.scalar_one_or_none()
        if not perm:
            perm = Permission(name=name)
            async_db.add(perm)
            await async_db.flush()
        db_perms.append(perm)

    await async_db.commit()
    return db_perms


@pytest.mark.asyncio
async def test_assign_permissions(auth_client, async_db, setup_permissions_for_assignment):
    perms = setup_permissions_for_assignment
    perm_ids = [p.id for p in perms]

    # create a target role
    stmt = select(Role).where(Role.name == "Test Role Target")
    res = await async_db.execute(stmt)
    role = res.scalar_one_or_none()
    if not role:
        role = Role(name="Test Role Target")
        async_db.add(role)
        await async_db.commit()

    role_id = role.id

    # 1. Assign Perms 0 and 1
    payload = {"role_id": role_id, "permission_ids": [perm_ids[0], perm_ids[1]]}

    resp = await auth_client.post("/role/assign_permission", json=payload)
    assert resp.status_code == 200

    # Verify in DB
    async_db.expire_all()
    stmt = select(Role).where(Role.id == role_id).options(selectinload(Role.permissions))
    res = await async_db.execute(stmt)
    role_loaded = res.scalar_one()

    role_perm_ids = sorted([p.id for p in role_loaded.permissions])
    expected_ids = sorted([perm_ids[0], perm_ids[1]])
    assert role_perm_ids == expected_ids

    # 2. Replace with Perm 2
    payload_update = {"role_id": role_id, "permission_ids": [perm_ids[2]]}
    resp = await auth_client.post("/role/assign_permission", json=payload_update)
    assert resp.status_code == 200

    # Verify
    async_db.expire_all()
    stmt = select(Role).where(Role.id == role_id).options(selectinload(Role.permissions))
    res = await async_db.execute(stmt)
    role_loaded = res.scalar_one()

    assert len(role_loaded.permissions) == 1
    assert role_loaded.permissions[0].id == perm_ids[2]

    # 3. Clear permissions
    payload_clear = {"role_id": role_id, "permission_ids": []}
    resp = await auth_client.post("/role/assign_permission", json=payload_clear)
    assert resp.status_code == 200

    async_db.expire_all()
    stmt = select(Role).where(Role.id == role_id).options(selectinload(Role.permissions))
    res = await async_db.execute(stmt)
    role_loaded = res.scalar_one()
    assert len(role_loaded.permissions) == 0
