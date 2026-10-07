"""EPMOS: tez-tez progon yuklamani tortmaydi.

Oʻlchangan (07.10.2026, jonli EPMOS): maʼlumotnomalarning toʻliq obhodi —
4765 qator, 10.87 soniya. Yuklama esa 27 000 dan ortiq qator va 15-30
soniya, lekin u kun davomida oʻzgarmaydi.

Shuning uchun yangi guruh yoki oʻqituvchi platformaga tez yetib borishi
uchun maʼlumotnomalarni har 15 daqiqada, yuklamani esa sutkada bir marta
tortish kifoya. `--skip-workloads` aynan shu uchun.
"""

import pytest
import pytest_asyncio

from app.modules.integration.eduplan.schemas import ApplyResponse, PreviewResponse
from app.modules.integration.eduplan.sync_runner import eduplan_sync_runner


@pytest_asyncio.fixture
async def quiet_run(monkeypatch):
    """Progon oʻrniga: EPMOS ga ham, bazaga ham tegmaydi.

    Bizni qiziqtirgan narsa bitta — yuklama sinxronizatsiyasi CHAQIRILDIMI.
    """
    calls = {"workloads": 0}

    async def fake_preview(session, entities=None):
        return PreviewResponse(
            run_id="test-run",
            generated_at="2026-10-07T09:00:00",
            entities=[],
            summary=[],
            proposals=[],
        )

    async def fake_apply(session, request):
        return ApplyResponse(run_id="test-run", results=[], finished_at="2026-10-07T09:00:05")

    async def fake_workloads(session, academic_year_id=None):
        calls["workloads"] += 1
        return {"created": 0}

    async def fake_lock_set(*a, **kw):
        return True

    async def fake_lock_del(*a, **kw):
        return 1

    monkeypatch.setattr(
        "app.modules.integration.eduplan.sync_runner.eduplan_sync_service.build_preview", fake_preview
    )
    monkeypatch.setattr(
        "app.modules.integration.eduplan.sync_runner.eduplan_sync_service.apply", fake_apply
    )
    monkeypatch.setattr(
        "app.modules.integration.eduplan.sync_runner.eduplan_workload_service.sync", fake_workloads
    )
    monkeypatch.setattr(
        "app.modules.integration.eduplan.sync_runner.redis_client.set", fake_lock_set
    )
    monkeypatch.setattr(
        "app.modules.integration.eduplan.sync_runner.redis_client.delete", fake_lock_del
    )
    return calls


@pytest.mark.asyncio
async def test_skip_workloads_does_not_touch_them(async_db, quiet_run):
    """Bayroq bilan — yuklama umuman soʻralmaydi."""
    summary = await eduplan_sync_runner.run(async_db, skip_workloads=True)

    assert quiet_run["workloads"] == 0
    assert summary["workloads_skipped"] is True
    assert summary["workloads"] is None


@pytest.mark.asyncio
async def test_default_run_still_imports_workloads(async_db, quiet_run):
    """Bayroqsiz xatti-harakat oʻzgarmadi: tungi progon avvalgidek toʻliq."""
    summary = await eduplan_sync_runner.run(async_db)

    assert quiet_run["workloads"] == 1
    assert summary["workloads_skipped"] is False
    assert summary["workloads"] == {"created": 0}


@pytest.mark.asyncio
async def test_skipping_is_not_reported_as_an_error(async_db, quiet_run):
    """Oʻtkazib yuborish — xato emas.

    `workloads_error` EPMOS yuklamani bermaganda toʻldiriladi; ataylab
    tashlab ketilgani bilan chalkashmasligi kerak, aks holda admin
    ekranida har 15 daqiqada qizil xabar chiqardi.
    """
    summary = await eduplan_sync_runner.run(async_db, skip_workloads=True)

    assert summary["workloads_error"] is None
