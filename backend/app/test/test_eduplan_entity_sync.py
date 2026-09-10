"""Bo'limlar bo'yicha alohida sinxronizatsiya.

Asosiy va'da: bitta bo'limni sinxronlash qolganlariga tegmaydi — EPMOS'dan
ham faqat o'sha bo'lim o'qiladi. Ilgari har qanday progn oltita ma'lumotnomani
birdan tortardi, ya'ni faqat o'qituvchilarni yangilamoqchi bo'lgan admin 683
guruh va 2919 fanni ham qayta o'qishga majbur edi.
"""

import pytest
import pytest_asyncio

from app.modules.integration.eduplan.schemas import (
    ENTITY_DEPENDENCIES,
    SYNC_ORDER,
    EduPlanEntity,
)
from app.modules.integration.eduplan.service import eduplan_sync_service


class FakeClient:
    """EPMOS o'rniga: qaysi ma'lumotnoma haqiqatan so'ralganini yozib boradi.

    Sinxronizatsiya tarmoqqa chiqmasligi kerak, lekin bizni qiziqtirgan narsa
    aynan shu — qaysi endpointlar chaqirildi.
    """

    def __init__(self) -> None:
        self.calls: list[str] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return None

    def _record(self, name: str, rows: list[dict]):
        async def reader():
            self.calls.append(name)
            return rows

        return reader

    def __getattr__(self, name: str):
        # Har bir ma'lumotnoma bo'sh ro'yxat qaytaradi: bizga tarkib emas,
        # chaqiruv fakti kerak.
        if name.startswith("_"):
            raise AttributeError(name)
        return self._record(name, [])


@pytest_asyncio.fixture
async def fake_client(monkeypatch):
    client = FakeClient()

    def factory(_cfg):
        return client

    async def fake_config(_session):
        class Cfg:
            is_configured = True

        return Cfg()

    monkeypatch.setattr(
        "app.modules.integration.eduplan.service.EduPlanClient", factory
    )
    monkeypatch.setattr(
        "app.modules.integration.eduplan.service.effective_config", fake_config
    )
    return client


@pytest.mark.asyncio
async def test_one_entity_reads_only_its_own_endpoint(async_db, fake_client):
    """Faqat o'qituvchilar so'ralsa, guruhlar va fanlar o'qilmaydi."""
    preview = await eduplan_sync_service.build_preview(async_db, [EduPlanEntity.teacher])

    assert fake_client.calls == ["staff"]
    assert [e.value for e in preview.entities] == ["teacher"]
    # Hisobotda ham faqat so'ralgan bo'lim: bo'sh qatorlar admin ekranida
    # «hech nima o'zgarmadi» degan yolg'on taassurot qoldirardi.
    assert [s.entity for s in preview.summary] == [EduPlanEntity.teacher]


@pytest.mark.asyncio
async def test_full_preview_reads_everything(async_db, fake_client):
    """Bo'lim ko'rsatilmasa — eski xatti-harakat, hammasi o'qiladi."""
    preview = await eduplan_sync_service.build_preview(async_db)

    assert set(fake_client.calls) == {
        "faculties",
        "departments",
        "specialities",
        "groups",
        "subjects",
        "staff",
        "edu_plans",
    }
    assert len(preview.entities) == len(SYNC_ORDER)


@pytest.mark.asyncio
async def test_several_entities_keep_sync_order(async_db, fake_client):
    """Tanlov tartibi emas, SYNC_ORDER hal qiladi.

    Bola ota-onadan keyin qo'llanishi shart: guruh mutaxassislikka tayanadi,
    va teskari tartibda o'tish bitta progn ichida bog'lanishni uzib qo'yardi.
    """
    preview = await eduplan_sync_service.build_preview(
        async_db, [EduPlanEntity.group, EduPlanEntity.faculty]
    )

    assert [e.value for e in preview.entities] == ["faculty", "group"]


@pytest.mark.asyncio
async def test_duplicate_selection_is_collapsed(async_db, fake_client):
    """Bir bo'lim ikki marta so'ralsa ham bir marta o'qiladi."""
    await eduplan_sync_service.build_preview(
        async_db, [EduPlanEntity.faculty, EduPlanEntity.faculty]
    )

    assert fake_client.calls == ["faculties"]


def test_dependencies_are_declared_for_every_entity():
    """Har bir bo'limning bog'liqligi e'lon qilingan bo'lishi kerak.

    Yangi bo'lim qo'shilganda buni unutish oson, natijada esa `_with_dependencies`
    uning ota-onasini yuklamay qo'yadi va qo'llash jimgina «ota-ona topilmadi»
    ga o'tadi.
    """
    for entity in SYNC_ORDER:
        assert entity in ENTITY_DEPENDENCIES, entity

    # Bog'liqlik faqat oldinga qarab bo'lishi mumkin: ota-ona SYNC_ORDER da
    # boladan oldin turishi shart, aks holda tartib ma'nosini yo'qotadi.
    position = {entity: i for i, entity in enumerate(SYNC_ORDER)}
    for entity, parents in ENTITY_DEPENDENCIES.items():
        for parent in parents:
            assert position[parent] < position[entity], f"{parent} -> {entity}"


def test_with_dependencies_pulls_the_whole_chain():
    """Guruh uchun mutaxassislik, kafedra va fakultet ham kerak.

    Ular qayta sinxronlanmaydi — faqat saqlangan ko'zgudan o'qiladi, ota-onaga
    havolani hal qilish uchun.
    """
    chain = eduplan_sync_service._with_dependencies([EduPlanEntity.group])

    assert [e.value for e in chain] == ["faculty", "kafedra", "speciality", "group"]


def test_curriculum_depends_on_speciality():
    """O'quv reja mutaxassislik orqali kafedra va fakultetga bog'lanadi."""
    chain = eduplan_sync_service._with_dependencies([EduPlanEntity.curriculum])

    assert [e.value for e in chain] == [
        "faculty",
        "kafedra",
        "speciality",
        "curriculum",
    ]


# ---------------------------------------------------------------------- #
#  O'quv reja: ota-ona bog'lanmaganda
# ---------------------------------------------------------------------- #
class CurriculumClient(FakeClient):
    """Bitta o'quv reja qaytaradigan EPMOS."""

    async def edu_plans(self):
        self.calls.append("edu_plans")
        return [
            {
                "id": 500,
                "name": "Test reja",
                "speciality_id": 77,
                "education_form": "Kunduzgi",
                "education_type": "Bakalavr",
                "is_active": True,
            }
        ]


@pytest_asyncio.fixture
async def curriculum_client(monkeypatch):
    client = CurriculumClient()

    async def fake_config(_session):
        class Cfg:
            is_configured = True

        return Cfg()

    monkeypatch.setattr(
        "app.modules.integration.eduplan.service.EduPlanClient", lambda _cfg: client
    )
    monkeypatch.setattr(
        "app.modules.integration.eduplan.service.effective_config", fake_config
    )
    return client


@pytest.mark.asyncio
async def test_curriculum_keeps_links_when_speciality_unresolved(
    async_db, curriculum_client, test_faculty, test_kafedra
):
    """Mutaxassislik bog'lanmasa, rejaning eski bog'lanishi saqlanadi.

    Bu jimgina buzilishning oldini oladi: bog'lanish nolga tushsa, reja
    fakultet bo'yicha filtrdan yo'qolardi, satr esa bazada joyida turardi —
    sababini topish uchun bazaga qarash kerak bo'lardi.
    """
    from app.modules.organization_structure.model import Curriculum, Speciality

    speciality = Speciality(name="Mutaxassislik", kafedra_id=test_kafedra["id"])
    async_db.add(speciality)
    await async_db.flush()

    # Reja allaqachon bog'langan, lekin mutaxassislik EPMOS bilan bog'lanmagan
    # (external_id yo'q) — ya'ni progn uni topa olmaydi.
    existing = Curriculum(
        name="Eski nom",
        speciality_id=speciality.id,
        kafedra_id=test_kafedra["id"],
        faculty_id=test_faculty["id"],
        external_id="500",
        external_source="eduplan",
    )
    async_db.add(existing)
    await async_db.commit()

    _, applied = await eduplan_sync_service.sync_entity(
        async_db, EduPlanEntity.curriculum
    )

    await async_db.refresh(existing)
    # Bog'lanishlar joyida qoldi…
    assert existing.speciality_id == speciality.id
    assert existing.faculty_id == test_faculty["id"]
    # …nom esa yangilandi: reja o'zi baribir ko'chiriladi.
    assert existing.name == "Test reja"

    # …va admin nima bo'lganini ko'radi.
    result = applied.results[0]
    assert len(result.errors) == 1
    assert "Mutaxassisliklarni sinxronlash" in result.errors[0]


@pytest.mark.asyncio
async def test_new_curriculum_is_created_without_speciality(
    async_db, curriculum_client
):
    """Yangi reja bog'lanmagan mutaxassislik bilan ham yaratiladi.

    Reja o'z-o'zicha ma'noli ma'lumotnoma, va uni yo'qotgandan ko'ra
    bog'lanishsiz saqlagan afzal: mutaxassislik bog'langach, keyingi progn
    bog'lanishni o'zi to'ldiradi.
    """
    from sqlalchemy import select

    from app.modules.organization_structure.model import Curriculum

    _, applied = await eduplan_sync_service.sync_entity(
        async_db, EduPlanEntity.curriculum
    )

    row = (
        await async_db.execute(select(Curriculum).where(Curriculum.external_id == "500"))
    ).scalar_one()
    assert row.name == "Test reja"
    assert row.speciality_id is None
    assert row.education_form == "Kunduzgi"
    assert applied.results[0].created == 1
    # Yangi satr uchun ogohlantirish yo'q: yo'qotadigan bog'lanish yo'q edi.
    assert applied.results[0].errors == []
