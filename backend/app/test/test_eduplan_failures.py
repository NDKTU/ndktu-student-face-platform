"""EPMOS: qoʻllanmagan yozuvlar kod shaklida qayd etiladi.

Ilgari band `hemis_id` va band login faqat LOGGA tushardi — ularni
serverga kirgan odamgina koʻrardi, admin ekranida esa progon muvaffaqiyatli
koʻrinardi. Holbuki sabab koʻpincha EPMOS tomonida: bir xodimga ikki marta
berilgan `hemis_id`, yoki ikki hisobga bitta login.

Shuning uchun sabablar endi `ApplyResult.failures` ga `reason` kodi bilan
tushadi. Kod shakli ataylab: EPMOS ning `POST /data/changes/report`
endpointi `^[a-z][a-z0-9_]*$` naqshli kodni kutadi, va erkin matndan
sababni ajratib olishga urinish kerak emas.
"""

import pytest
import pytest_asyncio

from app.modules.auth.model import Teacher, User
from app.modules.integration.eduplan.repository import eduplan_repository
from app.modules.integration.eduplan.schemas import EduPlanEntity, Proposal, ProposalAction
from app.modules.integration.eduplan.service import eduplan_sync_service as svc
from app.modules.integration.eduplan.schemas import ApplyResult

REASON_PATTERN = r"^[a-z][a-z0-9_]*$"


async def _teacher(async_db, *, username: str, hemis_id: str | None, external_id: str) -> Teacher:
    user = User(username=username, password="x")
    async_db.add(user)
    await async_db.flush()
    row = Teacher(
        user_id=user.id,
        first_name="Ism",
        last_name="Familiya",
        third_name="Sharif",
        full_name=f"Familiya Ism ({username})",
        hemis_id=hemis_id,
        external_id=external_id,
        external_source="eduplan",
    )
    async_db.add(row)
    await async_db.commit()
    await async_db.refresh(row)
    return row


@pytest_asyncio.fixture
async def two_teachers(async_db):
    first = await _teacher(async_db, username="epos_a", hemis_id="HEMIS-1", external_id="2001")
    second = await _teacher(async_db, username="epos_b", hemis_id=None, external_id="2002")
    return {"first": first, "second": second}


@pytest.mark.asyncio
async def test_taken_hemis_id_is_reported(async_db, two_teachers):
    """Band `hemis_id` endi jimgina oʻtib ketmaydi."""
    refused: list[dict] = []

    await eduplan_repository.upsert_teacher(
        async_db,
        external_id="2002",
        username="epos_b",
        hemis_id="HEMIS-1",  # birinchi oʻqituvchida band
        first_name="Ism",
        last_name="Familiya",
        third_name="Sharif",
        full_name="Familiya Ism",
        kafedra_id=None,
        existing=two_teachers["second"],
        failures=refused,
    )
    await async_db.commit()

    assert [item["reason"] for item in refused] == ["hemis_id_taken"]
    assert "HEMIS-1" in refused[0]["detail"]


@pytest.mark.asyncio
async def test_taken_username_is_reported(async_db, two_teachers):
    """Band login ham."""
    refused: list[dict] = []

    await eduplan_repository.upsert_teacher(
        async_db,
        external_id="2002",
        username="epos_a",  # birinchi oʻqituvchining logini
        hemis_id=None,
        first_name="Ism",
        last_name="Familiya",
        third_name="Sharif",
        full_name="Familiya Ism",
        kafedra_id=None,
        existing=two_teachers["second"],
        failures=refused,
    )
    await async_db.commit()

    assert [item["reason"] for item in refused] == ["username_taken"]


@pytest.mark.asyncio
async def test_successful_upsert_reports_nothing(async_db, two_teachers):
    """Hammasi joyida boʻlsa, roʻyxat boʻsh qoladi — shovqin yoʻq."""
    refused: list[dict] = []

    await eduplan_repository.upsert_teacher(
        async_db,
        external_id="2002",
        username="epos_b",
        hemis_id="HEMIS-2",
        first_name="Ism",
        last_name="Familiya",
        third_name="Sharif",
        full_name="Yangi nom",
        kafedra_id=None,
        existing=two_teachers["second"],
        failures=refused,
    )
    await async_db.commit()

    assert refused == []


def test_conflict_is_recorded_as_ambiguous_match():
    """Ikkilanish — eng koʻp uchraydigan sabab, u ham kodga tushadi."""
    result = ApplyResult(entity=EduPlanEntity.group)
    proposal = Proposal(
        entity=EduPlanEntity.group,
        action=ProposalAction.conflict,
        external_id="412",
        external_name="101B-23",
    )

    svc._fail(result, EduPlanEntity.group, proposal, "ambiguous_match", "ikkita satr mos keldi")

    assert len(result.failures) == 1
    failure = result.failures[0]
    assert failure.reason == "ambiguous_match"
    assert failure.external_id == "412"
    assert failure.entity == EduPlanEntity.group


def test_detail_is_trimmed_to_the_receiving_limit():
    """EPMOS `detail` ni 1000 belgida kesadi — 422 olmaslik uchun oʻzimiz kesamiz."""
    result = ApplyResult(entity=EduPlanEntity.teacher)
    proposal = Proposal(
        entity=EduPlanEntity.teacher,
        action=ProposalAction.update,
        external_id="9",
        external_name="Kimdir",
    )

    svc._fail(result, EduPlanEntity.teacher, proposal, "apply_failed", "x" * 5000)

    assert len(result.failures[0].detail) == 1000


@pytest.mark.parametrize(
    "reason",
    ["ambiguous_match", "parent_missing", "hemis_id_taken", "username_taken", "apply_failed"],
)
def test_reason_codes_match_the_receiving_format(reason):
    """Butun lugʻat EPMOS naqshiga mos — biror kod 422 bilan qaytmasin."""
    import re

    assert re.match(REASON_PATTERN, reason)
    assert len(reason) <= 64


@pytest.mark.parametrize("entity", list(EduPlanEntity))
def test_entity_values_match_the_receiving_format(entity):
    """Soha nomlari ham oʻsha naqshga tushadi."""
    import re

    assert re.match(REASON_PATTERN, entity.value)
    assert len(entity.value) <= 32
