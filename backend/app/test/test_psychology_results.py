"""Psixologik test natijalari: kim topshirgani va tashkiliy filtrlar.

Psixologga login yetmaydi — natija kimniki ekanini F.I.Sh., guruh va
fakultetdan biladi. Filtr variantlari esa `read:faculty` / `read:group`
ruxsatisiz ham ishlashi kerak.
"""

from datetime import date

import pytest
import pytest_asyncio

from app.modules.auth.model import Student, User
from app.modules.organization_structure.model import Group
from app.modules.psychology.model import PsychologyMethod, PsychologyResult


async def _student(async_db, *, username: str, full_name: str, number: str, group_id: int) -> int:
    user = User(username=username, password="not-used", is_active=True)
    async_db.add(user)
    await async_db.flush()
    async_db.add(
        Student(
            user_id=user.id,
            group_id=group_id,
            first_name=full_name.split()[0],
            last_name=full_name.split()[-1],
            third_name="",
            full_name=full_name,
            student_id_number=number,
            image_path="students/x.jpg",
            birth_date=date(2005, 1, 1),
            phone="+998901234567",
            gender="female",
            university="NDKTU",
            specialty="Kompyuter injiniringi",
            student_status="active",
            education_form="Kunduzgi",
            education_type="Bakalavr",
            payment_form="Kontrakt",
            education_lang="uz",
            faculty="Energetika",
            level="2-kurs",
            semester="3",
            address="Navoiy",
            avg_gpa=3.5,
        )
    )
    await async_db.flush()
    return user.id


@pytest_asyncio.fixture
async def psy_results(async_db, test_user, make_faculty, make_group):
    first_faculty = await make_faculty("Energetika")
    second_faculty = await make_faculty("Kimyo")
    group_a = await make_group("EN-21", first_faculty["id"])
    group_b = await make_group("KM-11", second_faculty["id"])
    # Natijasi yoʻq guruh filtr variantlariga tushmasligi kerak.
    await make_group("BOSH-1", first_faculty["id"])
    group = await async_db.get(Group, group_a["id"])
    group.course = 2
    await async_db.flush()

    method = PsychologyMethod(name="Spilberger", description="Xavotir")
    async_db.add(method)
    await async_db.flush()

    aziza = await _student(async_db, username="psy_aziza", full_name="Karimova Aziza", number="ST001", group_id=group_a["id"])
    bobur = await _student(async_db, username="psy_bobur", full_name="Toshev Bobur", number="ST002", group_id=group_b["id"])
    for user_id in (aziza, bobur, test_user["id"]):
        async_db.add(PsychologyResult(method_id=method.id, user_id=user_id, answers=[], diagnosis=None))
    await async_db.commit()

    return {
        "faculty_a": first_faculty["id"],
        "faculty_b": second_faculty["id"],
        "group_a": group_a["id"],
        "group_b": group_b["id"],
    }


@pytest.mark.asyncio
async def test_result_shows_student_info(auth_client, psy_results):
    response = await auth_client.get("/psychology/test/results/", params={"group_id": psy_results["group_a"]})

    assert response.status_code == 200, response.text
    [result] = response.json()["results"]
    user = result["user"]
    assert user["username"] == "psy_aziza"
    assert user["is_student"] is True
    assert user["full_name"] == "Karimova Aziza"
    assert user["student_id_number"] == "ST001"
    assert user["group_name"] == "EN-21"
    assert user["course"] == 2
    assert user["faculty_name"].lower() == "energetika"
    assert user["phone"] == "+998901234567"


@pytest.mark.asyncio
async def test_non_student_still_listed(auth_client, psy_results):
    """Talaba boʻlmagan foydalanuvchi ham roʻyxatda va login boʻyicha topiladi."""
    everything = await auth_client.get("/psychology/test/results/")
    assert everything.json()["total"] == 3

    found = await auth_client.get("/psychology/test/results/", params={"search": "test_user"})
    [result] = found.json()["results"]
    assert result["user"]["is_student"] is False
    assert result["user"]["group_name"] is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"search": "bobur"}, {"psy_bobur"}),
        ({"search": "ST001"}, {"psy_aziza"}),
        ({"course": 2}, {"psy_aziza"}),
        ({"search": "psy_", "faculty_key": "faculty_b"}, {"psy_bobur"}),
    ],
)
async def test_filters(auth_client, psy_results, params, expected):
    params = dict(params)
    if "faculty_key" in params:
        params["faculty_id"] = psy_results[params.pop("faculty_key")]

    response = await auth_client.get("/psychology/test/results/", params=params)

    assert response.status_code == 200, response.text
    body = response.json()
    assert {r["user"]["username"] for r in body["results"]} == expected
    assert body["total"] == len(expected)


@pytest.mark.asyncio
async def test_filter_options_only_groups_with_results(auth_client, psy_results):
    response = await auth_client.get("/psychology/test/results/filter-options")

    assert response.status_code == 200, response.text
    body = response.json()
    assert [f["name"].lower() for f in body["faculties"]] == ["energetika", "kimyo"]
    assert {(g["name"], g["faculty_id"]) for g in body["groups"]} == {
        ("EN-21", psy_results["faculty_a"]),
        ("KM-11", psy_results["faculty_b"]),
    }


@pytest_asyncio.fixture
async def student_client(async_client, auth_client, async_db, psy_results):
    """«psy_aziza» talaba roli bilan: unga `read:psychology_results` berilgan.

    Rollar oynasidan aynan shunday berilgan — talaba oʻz natijasini koʻrsin.
    """
    from core.utils.password_hash import hash_password
    from sqlalchemy import select

    from app.modules.auth.model import Permission, Role, RolePermission, UserRole

    role = Role(name="Student")
    async_db.add(role)
    await async_db.flush()
    permission = (
        await async_db.execute(select(Permission).where(Permission.name == "read:psychology_results"))
    ).scalar_one_or_none()
    if permission is None:
        permission = Permission(name="read:psychology_results")
        async_db.add(permission)
        await async_db.flush()
    async_db.add(RolePermission(role_id=role.id, permission_id=permission.id))

    user = (await async_db.execute(select(User).where(User.username == "psy_aziza"))).scalar_one()
    user.password = hash_password("password123")
    async_db.add(UserRole(user_id=user.id, role_id=role.id))
    await async_db.commit()

    response = await async_client.post("/user/login", json={"username": "psy_aziza", "password": "password123"})
    assert response.status_code == 200, response.text
    async_client.headers["Authorization"] = f"Bearer {response.json()['access_token']}"
    return async_client


@pytest.mark.asyncio
async def test_admin_sees_every_result(auth_client, psy_results):
    response = await auth_client.get("/psychology/test/results/")
    assert response.json()["total"] == 3


@pytest.mark.asyncio
async def test_student_sees_only_own_results(student_client, async_db, psy_results):
    from sqlalchemy import select

    response = await student_client.get("/psychology/test/results/")
    assert response.status_code == 200, response.text
    assert [r["user"]["username"] for r in response.json()["results"]] == ["psy_aziza"]

    # `user_id` parametri bilan ham boshqasiniki berilmaydi.
    bobur_id = (await async_db.execute(select(User.id).where(User.username == "psy_bobur"))).scalar_one()
    forged = await student_client.get("/psychology/test/results/", params={"user_id": bobur_id})
    assert [r["user"]["username"] for r in forged.json()["results"]] == ["psy_aziza"]


@pytest.mark.asyncio
async def test_student_cannot_open_foreign_result(student_client, async_db, psy_results):
    from sqlalchemy import select

    own_id, foreign_id = [
        (
            await async_db.execute(
                select(PsychologyResult.id).join(User, User.id == PsychologyResult.user_id).where(User.username == name)
            )
        ).scalar_one()
        for name in ("psy_aziza", "psy_bobur")
    ]

    assert (await student_client.get(f"/psychology/test/results/{own_id}")).status_code == 200
    assert (await student_client.get(f"/psychology/test/results/{foreign_id}")).status_code == 404


@pytest.mark.asyncio
async def test_student_has_no_statistics(student_client, psy_results):
    """Statistika va filtr variantlarida butun universitet — talabaga yopiq."""
    assert (await student_client.get("/psychology/test/results/filter-options")).status_code == 403
    assert (await student_client.get("/psychology/stats/overview")).status_code == 403
