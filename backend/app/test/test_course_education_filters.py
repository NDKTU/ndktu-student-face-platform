"""Kurslar ro'yxatining ta'lim turi va shakli bo'yicha filtrlari.

Ikkala qiymat ham kursning o'zida yo'q:

* Bakalavr/Magistr — yo'nalishda (`specialities.education_type`);
* Kunduzgi/Sirtqi/Kechki/Masofaviy — guruhda (`groups.education_shape`).

Shuning uchun filtrlar bog'liq jadvallarga boradi, va aynan shu yerda
xato qilish oson: guruh bo'yicha filtr kursni takrorlamasligi (bitta
kursda bir nechta guruh bo'ladi) va registr ahamiyatsiz bo'lishi kerak —
EPOS bir xil shaklni «Kunduzgi» ham, «kunduzgi» ham deb yozadi.
"""

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.modules.organization_structure.model import Group


async def _shape(async_db, group_id: int, shape: str, speciality_id: int) -> None:
    group = (await async_db.execute(select(Group).where(Group.id == group_id))).scalar_one()
    group.education_shape = shape
    group.speciality_id = speciality_id
    await async_db.commit()


@pytest_asyncio.fixture
async def courses_with_education(
    auth_client, async_db, test_user, test_faculty, test_kafedra, make_group, make_speciality, make_subject
):
    """Ikki kurs: bakalavr+kunduzgi va magistr+sirtqi."""
    bachelor = await make_speciality("Dasturiy injiniring", test_kafedra["id"], "Bakalavr")
    master = await make_speciality("Sun'iy intellekt", test_kafedra["id"], "Magistr")

    day_group = await make_group("101-24 DI", test_faculty["id"])
    ext_group = await make_group("201-24 SI", test_faculty["id"])
    # EPOS registrni turlicha yozadi — filtr buni hisobga olishi shart.
    await _shape(async_db, day_group["id"], "kunduzgi", bachelor["id"])
    await _shape(async_db, ext_group["id"], "Sirtqi", master["id"])

    created = {}
    for label, group, subject_name in (
        ("bachelor_day", day_group, "Algoritmlar"),
        ("master_ext", ext_group, "Mashina o'qitish"),
    ):
        subject = await make_subject(subject_name)
        response = await auth_client.post(
            "/course/",
            json={
                "subject_id": subject.id,
                "course_type": "lecture",
                "teacher_id": test_user["id"],
                "semester_number": 1,
                "group_ids": [group["id"]],
            },
        )
        assert response.status_code == 201, response.json()
        created[label] = response.json()["id"]

    return created


async def _ids(auth_client, **params) -> list[int]:
    response = await auth_client.get("/course/", params=params)
    assert response.status_code == 200, response.json()
    return [c["id"] for c in response.json()["courses"]]


@pytest.mark.asyncio
async def test_filters_by_education_type(courses_with_education, auth_client):
    bachelor = await _ids(auth_client, education_type="Bakalavr")

    assert courses_with_education["bachelor_day"] in bachelor
    # Filtrsiz ikkala kurs ham chiqadi — shuning uchun «yo'q» ni tekshirish
    # majburiy: usiz filtr umuman ishlamasa ham test yashil bo'lardi.
    assert courses_with_education["master_ext"] not in bachelor


@pytest.mark.asyncio
async def test_filters_by_education_form(courses_with_education, auth_client):
    external = await _ids(auth_client, education_form="Sirtqi")

    assert courses_with_education["master_ext"] in external
    assert courses_with_education["bachelor_day"] not in external


@pytest.mark.asyncio
async def test_education_form_ignores_case(courses_with_education, auth_client):
    """Guruhda «kunduzgi», so'rovda «Kunduzgi» — bir xil natija."""
    upper = await _ids(auth_client, education_form="Kunduzgi")
    lower = await _ids(auth_client, education_form="kunduzgi")

    assert courses_with_education["bachelor_day"] in upper
    # Begona kursning yo'qligi ham tekshiriladi: usiz filtr umuman
    # qo'llanmaganda ham ikkala ro'yxat teng bo'lib, test yashil qolardi.
    assert courses_with_education["master_ext"] not in upper
    assert upper == lower


@pytest.mark.asyncio
async def test_filters_combine(courses_with_education, auth_client):
    """Ikkala filtr birga — VA shartida, YOKI emas."""
    assert await _ids(auth_client, education_type="Bakalavr", education_form="Kunduzgi") == [
        courses_with_education["bachelor_day"]
    ]
    # Bunday kurs yo'q: bakalavr kunduzgi, magistr sirtqi.
    assert await _ids(auth_client, education_type="Bakalavr", education_form="Sirtqi") == []


@pytest.mark.asyncio
async def test_course_listed_once_with_several_matching_groups(
    auth_client, async_db, test_user, test_faculty, test_kafedra, make_group, make_speciality, make_subject
):
    """Bitta kursda ikkita kunduzgi guruh — ro'yxatda kurs bir marta.

    Filtr JOIN bilan yozilsa, kurs har mos guruh uchun takrorlanardi va
    `total` ham noto'g'ri chiqardi.
    """
    speciality = await make_speciality("Konchilik", test_kafedra["id"], "Bakalavr")
    first = await make_group("301-24 KI", test_faculty["id"])
    second = await make_group("302-24 KI", test_faculty["id"])
    await _shape(async_db, first["id"], "Kunduzgi", speciality["id"])
    await _shape(async_db, second["id"], "Kunduzgi", speciality["id"])

    subject = await make_subject("Geologiya")
    response = await auth_client.post(
        "/course/",
        json={
            "subject_id": subject.id,
            "course_type": "lecture",
            "teacher_id": test_user["id"],
            "semester_number": 1,
            "group_ids": [first["id"], second["id"]],
        },
    )
    assert response.status_code == 201, response.json()
    course_id = response.json()["id"]

    # Ro'yxatga tushmasligi kerak bo'lgan ikkinchi kurs: usiz `total == 1`
    # filtr ishlamaganda ham to'g'ri chiqardi.
    other_group = await make_group("303-24 KI", test_faculty["id"])
    await _shape(async_db, other_group["id"], "Sirtqi", speciality["id"])
    other_subject = await make_subject("Marksheyderiya")
    other = await auth_client.post(
        "/course/",
        json={
            "subject_id": other_subject.id,
            "course_type": "lecture",
            "teacher_id": test_user["id"],
            "semester_number": 1,
            "group_ids": [other_group["id"]],
        },
    )
    assert other.status_code == 201, other.json()

    listing = await auth_client.get("/course/", params={"education_form": "Kunduzgi"})
    assert listing.status_code == 200
    body = listing.json()
    assert [c["id"] for c in body["courses"]].count(course_id) == 1
    assert body["total"] == 1
