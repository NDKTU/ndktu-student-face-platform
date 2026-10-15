"""EPMOS yuklamasi: o'zgarmagan bog'lanish qayta yozilmaydi.

Ilgari `_persist` har satrga yangi `synced_at` qo'yardi: EPMOS'da hech
narsa o'zgarmasa ham ~24 ming alohida UPDATE ketardi (progon 30 s) va
hisobot «yangilandi: 24378» derdi. Endi «yangilandi» — faqat haqiqiy
o'zgarish, `synced_at` esa bitta so'rov bilan qo'yiladi.
"""

from datetime import datetime

import pytest
from sqlalchemy import select

from app.modules.auth.model import TeacherAssignment, TeacherSubject
from app.modules.integration.eduplan.workload_service import eduplan_workload_service as svc
from app.modules.organization_structure.model import TeacherGroup


async def _run(session, collapsed):
    created, updated = await svc._persist(session, collapsed)
    await svc._deactivate_missing(
        session,
        {(t, s) for t, s, _ in collapsed},
        {(t, g) for t, _, g in collapsed},
        set(collapsed),
    )
    await svc._touch_synced(session)
    await session.commit()
    return created, updated


@pytest.mark.asyncio
async def test_second_run_without_changes_updates_nothing(async_db, test_teacher, test_subject, test_group):
    key = (test_teacher["id"], test_subject.id, test_group["id"])

    def collapsed(load_types):
        return {key: {"load_types": set(load_types), "semester_types": {"Kuzgi"}}}

    # Birinchi progon: uchlik, (o'qituvchi, fan) va (o'qituvchi, guruh).
    assert await _run(async_db, collapsed(["Ma'ruza", "Amaliyot"])) == (3, 0)

    # Hech narsa o'zgarmadi — hech narsa yangilanmaydi.
    assert await _run(async_db, collapsed(["Amaliyot", "Ma'ruza"])) == (0, 0)

    # Faqat mashg'ulot turi o'zgardi: uchlik va (o'qituvchi, fan) — 2 ta.
    assert await _run(async_db, collapsed(["Ma'ruza"])) == (0, 2)
    ta = (await async_db.execute(select(TeacherAssignment))).scalar_one()
    assert ta.load_types == ["Ma'ruza"]


@pytest.mark.asyncio
async def test_synced_at_still_bumped_for_present_links(async_db, test_teacher, test_subject, test_group):
    """Yozilmasa ham `synced_at` yangilanadi — bitta so'rov bilan."""
    key = (test_teacher["id"], test_subject.id, test_group["id"])
    collapsed = {key: {"load_types": {"Ma'ruza"}, "semester_types": {"Kuzgi"}}}
    await _run(async_db, collapsed)

    old = datetime(2020, 1, 1)
    for model in (TeacherAssignment, TeacherSubject, TeacherGroup):
        for row in (await async_db.execute(select(model))).scalars():
            row.synced_at = old
    await async_db.commit()

    assert await _run(async_db, collapsed) == (0, 0)
    for model in (TeacherAssignment, TeacherSubject, TeacherGroup):
        for row in (await async_db.execute(select(model).execution_options(populate_existing=True))).scalars():
            assert row.synced_at > old, model.__name__
