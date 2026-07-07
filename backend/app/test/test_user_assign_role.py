import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.modules.auth.model import Role
from app.modules.auth.model import User


@pytest_asyncio.fixture
async def setup_roles_for_assignment(async_db):
    # Ensure roles exist
    roles = ["Role A", "Role B", "Role C"]
    db_roles = []
    for name in roles:
        stmt = select(Role).where(Role.name == name)
        res = await async_db.execute(stmt)
        role = res.scalar_one_or_none()
        if not role:
            role = Role(name=name)
            async_db.add(role)
            await async_db.flush()
        db_roles.append(role)

    await async_db.commit()
    return db_roles


@pytest.mark.asyncio
async def test_assign_roles(auth_client, async_db, setup_roles_for_assignment):
    roles = setup_roles_for_assignment
    role_ids = [r.id for r in roles]

    # create a target user
    stmt = select(User).where(User.username == "target_user")
    res = await async_db.execute(stmt)
    user = res.scalar_one_or_none()
    if not user:
        user = User(username="target_user", password="password")
        async_db.add(user)
        await async_db.commit()

    user_id = user.id

    # 1. Assign Roles A and B (indices 0 and 1)
    payload = {"user_id": user_id, "role_ids": [role_ids[0], role_ids[1]]}

    resp = await auth_client.post("/user/assign_role", json=payload)
    assert resp.status_code == 200

    # Verify in DB
    await async_db.refresh(user)
    # We need to explicitly reload roles
    stmt = select(User).where(User.id == user_id).options(selectinload(User.roles))
    res = await async_db.execute(stmt)
    user_loaded = res.scalar_one()

    user_role_ids = sorted([r.id for r in user_loaded.roles])
    expected_ids = sorted([role_ids[0], role_ids[1]])
    assert user_role_ids == expected_ids

    # 2. Replace with Role C (index 2)
    payload_update = {"user_id": user_id, "role_ids": [role_ids[2]]}
    resp = await auth_client.post("/user/assign_role", json=payload_update)
    assert resp.status_code == 200

    # Verify
    async_db.expire_all()  # force reload
    stmt = select(User).where(User.id == user_id).options(selectinload(User.roles))
    res = await async_db.execute(stmt)
    user_loaded = res.scalar_one()

    assert len(user_loaded.roles) == 1
    assert user_loaded.roles[0].id == role_ids[2]

    # 3. Clear roles
    payload_clear = {"user_id": user_id, "role_ids": []}
    resp = await auth_client.post("/user/assign_role", json=payload_clear)
    assert resp.status_code == 200

    async_db.expire_all()
    stmt = select(User).where(User.id == user_id).options(selectinload(User.roles))
    res = await async_db.execute(stmt)
    user_loaded = res.scalar_one()
    assert len(user_loaded.roles) == 0
