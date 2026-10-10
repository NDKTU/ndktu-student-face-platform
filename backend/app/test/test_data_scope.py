"""Koʻrish doirasi: admin rolga «kimning maʼlumotini koʻradi»ni beradi.

Doira turi rolda (`roles.data_scope`), aniq fakultet/kafedra/guruh —
foydalanuvchida (`user_data_scopes`). Bu yerda u uchta joyda tekshiriladi:
talabalar roʻyxati, test natijalari va psixologiya (roʻyxat + statistika).

Tuzilma: A fakulteti (kafedra KA → mutaxassislik → guruh GA) va
B fakulteti (guruh GB). Har bir guruhda bitta talaba, har birida bitta
test natijasi va bitta psixologik natija.
"""

from datetime import date

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import select, update

from app.modules.psychology.model import PsychologyMethod, PsychologyResult

READ_PERMISSIONS = ("read:student", "read:result", "read:psychology_results", "read:psychology")


def _student(user_id: int, group_id: int, number: str):
    from app.modules.auth.model import Student

    return Student(
        user_id=user_id,
        group_id=group_id,
        first_name=number,
        last_name="Talaba",
        third_name="T",
        full_name=f"{number} Talaba T",
        student_id_number=number,
        image_path="",
        birth_date=date(2000, 1, 1),
        phone="998900000000",
        gender="M",
        university="NDKTU",
        specialty="Dasturiy injiniring",
        student_status="Active",
        education_form="Kunduzgi",
        education_type="Bakalavr",
        payment_form="Shartnoma",
        education_lang="Oʻzbek",
        faculty="IT",
        level="1",
        semester="1",
        address="Navoiy",
        avg_gpa=4.0,
    )


async def _make_role(async_db, name: str, permissions: tuple[str, ...], data_scope: str | None = None):
    from app.modules.auth.model import Permission, Role, RolePermission

    role = Role(name=name)
    if data_scope is not None:
        role.data_scope = data_scope
    async_db.add(role)
    await async_db.flush()
    for permission_name in permissions:
        permission = (
            await async_db.execute(select(Permission).where(Permission.name == permission_name))
        ).scalar_one_or_none()
        if permission is None:
            permission = Permission(name=permission_name)
            async_db.add(permission)
            await async_db.flush()
        async_db.add(RolePermission(role_id=role.id, permission_id=permission.id))
    await async_db.flush()
    return role


async def _make_user(async_db, username: str, role) -> int:
    from core.utils.password_hash import hash_password

    from app.modules.auth.model import User, UserRole

    user = User(username=username, password=hash_password("password123"), is_active=True)
    async_db.add(user)
    await async_db.flush()
    async_db.add(UserRole(user_id=user.id, role_id=role.id))
    await async_db.flush()
    return user.id


async def _login(async_client: AsyncClient, username: str) -> AsyncClient:
    response = await async_client.post("/user/login", json={"username": username, "password": "password123"})
    assert response.status_code == 200
    async_client.headers["Authorization"] = f"Bearer {response.json()['access_token']}"
    return async_client


@pytest_asyncio.fixture
async def org(async_db, make_faculty, make_kafedra, make_speciality, make_group):
    from app.modules.organization_structure.model import Group
    from app.modules.quiz.model import Result

    faculty_a = await make_faculty("Scope A fakulteti")
    faculty_b = await make_faculty("Scope B fakulteti")
    kafedra_a = await make_kafedra("Scope KA", faculty_a["id"])
    speciality_a = await make_speciality("Scope SA", kafedra_a["id"])
    group_a = await make_group("SCOPE-GA", faculty_a["id"])
    group_b = await make_group("SCOPE-GB", faculty_b["id"])
    # Kafedra guruhlari mutaxassislik orqali topiladi.
    await async_db.execute(update(Group).where(Group.id == group_a["id"]).values(speciality_id=speciality_a["id"]))

    student_role = await _make_role(async_db, "student", ("read:psychology",))
    user_a = await _make_user(async_db, "scope_student_a", student_role)
    user_b = await _make_user(async_db, "scope_student_b", student_role)
    student_a = _student(user_a, group_a["id"], "SC-A")
    student_b = _student(user_b, group_b["id"], "SC-B")
    async_db.add_all([student_a, student_b])

    method = PsychologyMethod(name="Doira metodi", description="izoh")
    async_db.add(method)
    await async_db.flush()

    result_a = Result(user_id=user_a, group_id=group_a["id"], status="finished", grade=5)
    result_b = Result(user_id=user_b, group_id=group_b["id"], status="finished", grade=4)
    psy_a = PsychologyResult(method_id=method.id, user_id=user_a, answers=[], diagnosis={"label": "Norma"})
    psy_b = PsychologyResult(method_id=method.id, user_id=user_b, answers=[], diagnosis={"label": "Norma"})
    async_db.add_all([result_a, result_b, psy_a, psy_b])
    await async_db.commit()

    return {
        "faculty_a": faculty_a["id"],
        "faculty_b": faculty_b["id"],
        "kafedra_a": kafedra_a["id"],
        "group_a": group_a["id"],
        "group_b": group_b["id"],
        "student_a": student_a.id,
        "student_b": student_b.id,
        "user_a": user_a,
        "user_b": user_b,
        "result_a": result_a.id,
        "result_b": result_b.id,
        "psy_a": psy_a.id,
        "psy_b": psy_b.id,
        "method_id": method.id,
    }


async def _scoped_user(async_db, username: str, scope: str, *, faculty_id=None, kafedra_id=None, group_id=None):
    from app.modules.auth.model import UserDataScope

    role = await _make_role(async_db, f"role_{username}", READ_PERMISSIONS, data_scope=scope)
    user_id = await _make_user(async_db, username, role)
    if faculty_id or kafedra_id or group_id:
        async_db.add(UserDataScope(user_id=user_id, faculty_id=faculty_id, kafedra_id=kafedra_id, group_id=group_id))
    await async_db.commit()
    return user_id


async def _visible(client: AsyncClient) -> dict[str, set[int]]:
    students = await client.get("/students/")
    results = await client.get("/result/")
    psychology = await client.get("/psychology/test/results/")
    assert students.status_code == 200, students.text
    assert results.status_code == 200, results.text
    assert psychology.status_code == 200, psychology.text
    return {
        "students": {s["id"] for s in students.json()["students"]},
        "results": {r["id"] for r in results.json()["results"]},
        "psychology": {r["id"] for r in psychology.json()["results"]},
    }


@pytest.mark.asyncio
async def test_faculty_scope_sees_only_its_faculty(async_client, async_db, org):
    await _scoped_user(async_db, "dekan_a", "faculty", faculty_id=org["faculty_a"])
    seen = await _visible(await _login(async_client, "dekan_a"))

    assert seen["students"] == {org["student_a"]}
    assert seen["results"] == {org["result_a"]}
    assert seen["psychology"] == {org["psy_a"]}


@pytest.mark.asyncio
async def test_kafedra_scope_goes_through_speciality(async_client, async_db, org):
    await _scoped_user(async_db, "mudir_a", "kafedra", kafedra_id=org["kafedra_a"])
    seen = await _visible(await _login(async_client, "mudir_a"))

    assert seen["students"] == {org["student_a"]}
    assert seen["results"] == {org["result_a"]}
    assert seen["psychology"] == {org["psy_a"]}


@pytest.mark.asyncio
async def test_assigned_groups_scope_uses_bound_groups(async_client, async_db, org):
    """Tutor: oʻqituvchi emas, guruhlari qoʻlda biriktiriladi."""
    await _scoped_user(async_db, "tutor_b", "assigned_groups", group_id=org["group_b"])
    seen = await _visible(await _login(async_client, "tutor_b"))

    assert seen["students"] == {org["student_b"]}
    assert seen["results"] == {org["result_b"]}
    assert seen["psychology"] == {org["psy_b"]}


@pytest.mark.asyncio
async def test_scope_without_binding_sees_nothing(async_client, async_db, org):
    """Fakultet doirasi, lekin fakultet tanlanmagan — hech kim, hamma emas."""
    await _scoped_user(async_db, "dekan_none", "faculty")
    seen = await _visible(await _login(async_client, "dekan_none"))

    assert seen == {"students": set(), "results": set(), "psychology": set()}


@pytest.mark.asyncio
async def test_binding_of_another_kind_is_ignored(async_client, async_db, org):
    """Rol `faculty`, biriktirma esa guruh — guruh hech narsa bermaydi."""
    await _scoped_user(async_db, "dekan_group", "faculty", group_id=org["group_a"])
    seen = await _visible(await _login(async_client, "dekan_group"))

    assert seen["students"] == set()


@pytest.mark.asyncio
async def test_faculty_scope_cannot_ask_for_an_outsider(async_client, async_db, org):
    await _scoped_user(async_db, "dekan_forge", "faculty", faculty_id=org["faculty_a"])
    client = await _login(async_client, "dekan_forge")

    response = await client.get("/psychology/test/results/", params={"user_id": org["user_b"]})
    assert response.json()["results"] == []
    results = await client.get("/result/", params={"user_id": org["user_b"]})
    assert results.json()["results"] == []


@pytest.mark.asyncio
async def test_all_scope_sees_everything(async_client, async_db, org):
    await _scoped_user(async_db, "psixolog_all", "all")
    seen = await _visible(await _login(async_client, "psixolog_all"))

    assert {org["student_a"], org["student_b"]} <= seen["students"]
    assert {org["result_a"], org["result_b"]} <= seen["results"]
    assert {org["psy_a"], org["psy_b"]} <= seen["psychology"]


@pytest.mark.asyncio
async def test_single_items_outside_scope_are_404(async_client, async_db, org):
    await _scoped_user(async_db, "dekan_ids", "faculty", faculty_id=org["faculty_a"])
    client = await _login(async_client, "dekan_ids")

    assert (await client.get(f"/students/{org['student_a']}")).status_code == 200
    assert (await client.get(f"/students/{org['student_b']}")).status_code == 404
    assert (await client.get(f"/result/{org['result_a']}")).status_code == 200
    assert (await client.get(f"/result/{org['result_b']}")).status_code == 404
    assert (await client.get(f"/psychology/test/results/{org['psy_a']}")).status_code == 200
    assert (await client.get(f"/psychology/test/results/{org['psy_b']}")).status_code == 404
    assert (await client.get(f"/psychology/stats/users/{org['user_b']}/history")).status_code == 404


@pytest.mark.asyncio
async def test_psychology_stats_follow_scope(async_client, async_db, org):
    await _scoped_user(async_db, "dekan_stats", "faculty", faculty_id=org["faculty_a"])
    client = await _login(async_client, "dekan_stats")

    overview = await client.get("/psychology/stats/overview")
    assert overview.status_code == 200, overview.text
    assert overview.json()["total_results"] == 1
    assert {f["faculty_id"] for f in overview.json()["faculties"]} == {org["faculty_a"]}

    # Mijoz soʻrov parametri bilan doirani kengaytira olmaydi.
    widened = await client.get("/psychology/stats/overview", params={"scope_group_ids": org["group_b"]})
    assert widened.json()["total_results"] == 1

    # Dinamika `model_copy` qiladi — doira nusxada ham saqlanishi shart.
    timeline = await client.get("/psychology/stats/timeline", params={"period": "day"})
    assert timeline.status_code == 200
    assert sum(p["count"] for p in timeline.json()["points"]) == 1

    options = await client.get("/psychology/test/results/filter-options")
    assert options.status_code == 200
    assert {g["id"] for g in options.json()["groups"]} == {org["group_a"]}


@pytest.mark.asyncio
async def test_student_still_sees_only_own_psychology(async_client, async_db, org):
    client = await _login(async_client, "scope_student_a")
    # Talabaga `read:psychology_results` bu yerda berilmagan — faqat doira tekshiriladi.
    from app.modules.auth.model import Permission, Role, RolePermission

    role = (await async_db.execute(select(Role).where(Role.name == "student"))).scalar_one()
    permission = Permission(name="read:psychology_results")
    async_db.add(permission)
    await async_db.flush()
    async_db.add(RolePermission(role_id=role.id, permission_id=permission.id))
    await async_db.commit()

    # Boshqasining `user_id` si eʼtiborga olinmaydi — oʻziniki qaytadi.
    response = await client.get("/psychology/test/results/", params={"user_id": org["user_b"]})
    assert response.status_code == 200
    assert {r["id"] for r in response.json()["results"]} == {org["psy_a"]}

    own = await client.get("/psychology/test/results/")
    assert {r["id"] for r in own.json()["results"]} == {org["psy_a"]}


# ── Sozlash: rol va foydalanuvchi ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_system_roles_get_their_scope_by_name(async_db):
    from app.modules.auth.model import Role

    roles = [Role(name=name) for name in ("teacher", "student", "psixologik", "dekanat_yangi")]
    async_db.add_all(roles)
    await async_db.commit()

    assert [r.data_scope for r in roles] == ["assigned_groups", "own", "all", "own"]


@pytest.mark.asyncio
async def test_admin_sets_role_scope(auth_client):
    created = await auth_client.post("/role/", json={"name": "dekan", "data_scope": "faculty"})
    assert created.status_code == 201, created.text
    assert created.json()["data_scope"] == "faculty"

    updated = await auth_client.put(f"/role/{created.json()['id']}", json={"name": "dekan", "data_scope": "kafedra"})
    assert updated.status_code == 200
    assert updated.json()["data_scope"] == "kafedra"

    invalid = await auth_client.put(f"/role/{created.json()['id']}", json={"name": "dekan", "data_scope": "galaxy"})
    assert invalid.status_code == 422


@pytest.mark.asyncio
async def test_admin_role_cannot_be_narrowed(auth_client, test_role):
    response = await auth_client.put(f"/role/{test_role.id}", json={"name": "Admin", "data_scope": "own"})
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_user_scope_bindings_roundtrip(auth_client, async_db, org):
    user_id = await _scoped_user(async_db, "dekan_api", "faculty")

    put = await auth_client.put(
        f"/user/{user_id}/data-scope",
        json={"faculty_ids": [org["faculty_a"]], "kafedra_ids": [org["kafedra_a"]], "group_ids": []},
    )
    assert put.status_code == 200, put.text
    assert [f["id"] for f in put.json()["faculties"]] == [org["faculty_a"]]
    assert [k["id"] for k in put.json()["kafedras"]] == [org["kafedra_a"]]

    # To'liq almashtirish: so'rovda yo'q kafedra o'chadi.
    put = await auth_client.put(f"/user/{user_id}/data-scope", json={"faculty_ids": [org["faculty_b"]]})
    got = await auth_client.get(f"/user/{user_id}/data-scope")
    assert got.status_code == 200
    assert [f["id"] for f in got.json()["faculties"]] == [org["faculty_b"]]
    assert got.json()["kafedras"] == []

    missing = await auth_client.put(f"/user/{user_id}/data-scope", json={"group_ids": [999999]})
    assert missing.status_code == 400


# ── Elementar testlar ────────────────────────────────────────────────────────

GENERAL_TEST_READ = ("read:general_test_subject", "read:general_test", "read:general_test_result")


@pytest_asyncio.fixture
async def general_test(async_db, test_user, org):
    """Admin yaratgan fan va test; ikkala talaba ham uni topshirgan."""
    from app.modules.general_test.model import GeneralTest, GeneralTestAttempt, GeneralTestSubject

    subject = GeneralTestSubject(name="Doira fani", created_by_user_id=test_user["id"])
    async_db.add(subject)
    await async_db.flush()
    test = GeneralTest(subject_id=subject.id, title="Doira testi", created_by_user_id=test_user["id"], pin="482913")
    async_db.add(test)
    await async_db.flush()
    attempts = [
        GeneralTestAttempt(test_id=test.id, user_id=org[key], status="completed", finished_at=date(2026, 10, 1))
        for key in ("user_a", "user_b")
    ]
    async_db.add_all(attempts)
    await async_db.commit()
    return {"subject_id": subject.id, "test_id": test.id, "attempt_a": attempts[0].id, "attempt_b": attempts[1].id}


async def _general_viewer(async_db, username: str, scope: str, **binding) -> None:
    from app.modules.auth.model import UserDataScope

    role = await _make_role(async_db, f"role_{username}", GENERAL_TEST_READ, data_scope=scope)
    user_id = await _make_user(async_db, username, role)
    if binding:
        async_db.add(UserDataScope(user_id=user_id, **binding))
    await async_db.commit()


@pytest.mark.asyncio
async def test_all_scope_sees_foreign_general_tests_read_only(async_client, async_db, org, general_test):
    """«Butun universitet» — begona fan va testni koʻradi, lekin boshqarmaydi."""
    await _general_viewer(async_db, "kuzatuvchi", "all")
    client = await _login(async_client, "kuzatuvchi")

    subjects = await client.get("/general-test/subject")
    assert subjects.status_code == 200, subjects.text
    row = next(s for s in subjects.json()["subjects"] if s["id"] == general_test["subject_id"])
    assert row["can_manage"] is False

    assert (await client.get(f"/general-test/subject/{general_test['subject_id']}")).status_code == 200
    detail = await client.get(f"/general-test/{general_test['test_id']}")
    assert detail.status_code == 200
    tests = await client.get("/general-test/")
    row = next(t for t in tests.json()["tests"] if t["id"] == general_test["test_id"])

    # PIN koʻrinmaydi — faqat borligi: aks holda kuzatuvchi uni talabalarga tarqatardi.
    for item in (row, detail.json()):
        assert item["pin"] is None
        assert item["pin_required"] is True
        assert item["can_manage"] is False

    # Yangi PIN yaratish ham yopiq.
    regen = await client.put(f"/general-test/{general_test['test_id']}", json={"regenerate_pin": True})
    assert regen.status_code == 403

    results = await client.get("/general-test/results")
    assert {r["attempt_id"] for r in results.json()["results"]} >= {general_test["attempt_a"], general_test["attempt_b"]}


@pytest.mark.asyncio
async def test_own_scope_still_sees_only_own_general_tests(async_client, async_db, org, general_test):
    await _general_viewer(async_db, "begona", "own")
    client = await _login(async_client, "begona")

    subjects = await client.get("/general-test/subject")
    assert general_test["subject_id"] not in {s["id"] for s in subjects.json()["subjects"]}
    assert (await client.get(f"/general-test/subject/{general_test['subject_id']}")).status_code == 403
    assert (await client.get(f"/general-test/{general_test['test_id']}")).status_code == 403
    assert (await client.get("/general-test/results")).json()["results"] == []


@pytest.mark.asyncio
async def test_faculty_scope_sees_general_results_of_its_students(async_client, async_db, org, general_test):
    await _general_viewer(async_db, "dekan_gt", "faculty", faculty_id=org["faculty_a"])
    client = await _login(async_client, "dekan_gt")

    results = await client.get("/general-test/results")
    assert results.status_code == 200, results.text
    assert {r["attempt_id"] for r in results.json()["results"]} == {general_test["attempt_a"]}


@pytest.mark.asyncio
async def test_owner_sees_and_regenerates_pin(auth_client, general_test):
    before = (await auth_client.get(f"/general-test/{general_test['test_id']}")).json()
    assert before["pin"] == "482913"
    assert before["can_manage"] is True

    regen = await auth_client.put(f"/general-test/{general_test['test_id']}", json={"regenerate_pin": True})
    assert regen.status_code == 200, regen.text
    assert regen.json()["pin"] not in (None, "482913")
