"""Elementar test: fanlar va kim testni ko'radi.

Test faqat faol bo'lsa va foydalanuvchi uning faniga biriktirilgan yoki
testga biriktirilgan guruhda o'qisa ko'rinadi. Sahnada uchta oddiy
foydalanuvchi bor: fanga biriktiriladigan xodim, guruh orqali kiradigan
talaba va hech qayerga biriktirilmagan begona — u hech qachon testni
ko'rmasligi kerak.
"""

import pytest
import pytest_asyncio

from app.test.test_student_dashboard import _login, _user
from app.test.test_student_teacher_scope import _student


@pytest_asyncio.fixture
async def scene(async_db, auth_client, test_faculty, make_group):
    from app.modules.auth.model import Permission, Role, RolePermission

    role = Role(name="taker")
    async_db.add(role)
    await async_db.flush()
    permission = Permission(name="general_test:take")
    async_db.add(permission)
    await async_db.flush()
    async_db.add(RolePermission(role_id=role.id, permission_id=permission.id))

    staff = await _user(async_db, role, "gt_staff")
    student = await _user(async_db, role, "gt_student")
    stranger = await _user(async_db, role, "gt_stranger")
    group = await make_group("GT-101", test_faculty["id"])
    other_group = await make_group("GT-202", test_faculty["id"])
    async_db.add(_student(student.id, group["id"], "GT1", "Ali"))
    async_db.add(_student(stranger.id, other_group["id"], "GT2", "Vali"))
    await async_db.commit()

    subject = await auth_client.post("/general-test/subject", json={"name": "Axborot xavfsizligi"})
    assert subject.status_code == 201, subject.text
    subject_id = subject.json()["id"]

    test = await auth_client.post("/general-test/", json={"subject_id": subject_id, "is_active": True})
    assert test.status_code == 201, test.text
    test_id = test.json()["id"]
    question = await auth_client.post(
        f"/general-test/subject/{subject_id}/question",
        json={"text": "2+2?", "option_a": "4", "option_b": "3", "option_c": "5", "option_d": "6"},
    )
    assert question.status_code == 201, question.text

    return {
        "subject_id": subject_id,
        "test_id": test_id,
        "group_id": group["id"],
        "other_group_id": other_group["id"],
        "staff": staff,
        "student": student,
        "stranger": stranger,
    }


async def _available(async_client, username: str) -> list[int]:
    response = await async_client.get("/general-test/available", headers=await _login(async_client, username))
    assert response.status_code == 200, response.text
    return [t["id"] for t in response.json()["tests"]]


@pytest.mark.asyncio
async def test_unassigned_test_is_hidden_from_everyone(async_client, scene):
    for username in ("gt_staff", "gt_student", "gt_stranger"):
        assert await _available(async_client, username) == []

    start = await async_client.post(
        f"/general-test/{scene['test_id']}/start", headers=await _login(async_client, "gt_stranger")
    )
    assert start.status_code == 404


@pytest.mark.asyncio
async def test_subject_user_sees_active_test(auth_client, async_client, scene):
    added = await auth_client.post(
        f"/general-test/subject/{scene['subject_id']}/users", json={"user_ids": [scene["staff"].id]}
    )
    assert added.status_code == 200, added.text
    assert added.json()["added"] == 1

    assert await _available(async_client, "gt_staff") == [scene["test_id"]]
    assert await _available(async_client, "gt_stranger") == []

    headers = await _login(async_client, "gt_staff")
    start = await async_client.post(f"/general-test/{scene['test_id']}/start", headers=headers)
    assert start.status_code == 200, start.text
    finished = await async_client.post(
        f"/general-test/attempt/{start.json()['attempt_id']}/finish", headers=headers
    )
    assert finished.status_code == 200, finished.text

    # O'chirib qo'yilgan test biriktirilganga ham ko'rinmaydi (boshlangan
    # urinishi bo'lmasa — u holda qaytish uchun ro'yxatda qoladi).
    off = await auth_client.put(f"/general-test/{scene['test_id']}", json={"is_active": False})
    assert off.status_code == 200
    assert await _available(async_client, "gt_staff") == []


@pytest.mark.asyncio
async def test_group_student_sees_test(auth_client, async_client, scene):
    detail = await auth_client.post(
        f"/general-test/{scene['test_id']}/groups", json={"group_ids": [scene["group_id"]]}
    )
    assert detail.status_code == 200, detail.text
    assert [g["id"] for g in detail.json()["groups"]] == [scene["group_id"]]
    assert detail.json()["groups"][0]["student_count"] == 1

    assert await _available(async_client, "gt_student") == [scene["test_id"]]
    # Boshqa guruh talabasi va xodim ko'rmaydi.
    assert await _available(async_client, "gt_stranger") == []
    assert await _available(async_client, "gt_staff") == []

    removed = await auth_client.delete(f"/general-test/{scene['test_id']}/groups/{scene['group_id']}")
    assert removed.status_code == 200
    assert await _available(async_client, "gt_student") == []


@pytest.mark.asyncio
async def test_candidates_filter_and_bulk_add(auth_client, scene):
    subject_id = scene["subject_id"]
    students = await auth_client.get(f"/general-test/subject/{subject_id}/candidates", params={"kind": "student"})
    assert students.status_code == 200, students.text
    assert {u["username"] for u in students.json()["users"]} == {"gt_student", "gt_stranger"}

    in_group = await auth_client.get(
        f"/general-test/subject/{subject_id}/candidates", params={"group_id": scene["group_id"]}
    )
    assert [u["username"] for u in in_group.json()["users"]] == ["gt_student"]
    assert in_group.json()["users"][0]["group_name"] == "GT-101"

    # Filtrga mos hammasi: ekrandagi ro'yxat bilan bir xil.
    added = await auth_client.post(
        f"/general-test/subject/{subject_id}/users", json={"filter": {"kind": "student"}}
    )
    assert added.json()["added"] == 2
    again = await auth_client.post(f"/general-test/subject/{subject_id}/users", json={"filter": {"kind": "student"}})
    assert again.json()["added"] == 0

    assigned = await auth_client.get(f"/general-test/subject/{subject_id}/users")
    assert assigned.json()["total"] == 2
    marked = await auth_client.get(f"/general-test/subject/{subject_id}/candidates", params={"kind": "student"})
    assert all(u["assigned"] for u in marked.json()["users"])

    removed = await auth_client.delete(f"/general-test/subject/{subject_id}/users/{scene['stranger'].id}")
    assert removed.status_code == 204
    assert (await auth_client.get(f"/general-test/subject/{subject_id}/users")).json()["total"] == 1


@pytest.mark.asyncio
async def test_subject_rules(auth_client, scene):
    duplicate = await auth_client.post("/general-test/subject", json={"name": "  axborot XAVFSIZLIGI "})
    assert duplicate.status_code == 409

    no_subject = await auth_client.post("/general-test/", json={"subject_id": 999999})
    assert no_subject.status_code == 404

    busy = await auth_client.delete(f"/general-test/subject/{scene['subject_id']}")
    assert busy.status_code == 409

    listed = await auth_client.get("/general-test/subject")
    row = listed.json()["subjects"][0]
    assert row["test_count"] == 1 and row["user_count"] == 0

    tests = await auth_client.get("/general-test/", params={"subject_id": scene["subject_id"]})
    assert tests.json()["tests"][0]["subject"]["name"] == "Axborot xavfsizligi"

    other = await auth_client.post("/general-test/subject", json={"name": "Raqamli savodxonlik"})
    moved = await auth_client.put(f"/general-test/{scene['test_id']}", json={"subject_id": other.json()["id"]})
    assert moved.status_code == 200
    assert moved.json()["subject"]["name"] == "Raqamli savodxonlik"
    # Bo'shagan fanni endi o'chirsa bo'ladi.
    assert (await auth_client.delete(f"/general-test/subject/{scene['subject_id']}")).status_code == 204

    assert (await auth_client.delete(f"/general-test/{scene['test_id']}")).status_code == 204
    assert (await auth_client.delete(f"/general-test/subject/{other.json()['id']}")).status_code == 204


@pytest.mark.asyncio
async def test_question_number_limits_each_attempt(auth_client, async_client, scene):
    test_id = scene["test_id"]
    for text in ("3+3?", "4+4?"):
        created = await auth_client.post(
            f"/general-test/subject/{scene['subject_id']}/question",
            json={"text": text, "option_a": "x", "option_b": "y", "option_c": "z", "option_d": "w"},
        )
        assert created.status_code == 201
    updated = await auth_client.put(f"/general-test/{test_id}", json={"question_number": 2, "attempt_limit": 2})
    assert updated.json()["question_number"] == 2
    assert updated.json()["question_count"] == 3
    await auth_client.post(f"/general-test/subject/{scene['subject_id']}/users", json={"user_ids": [scene["staff"].id]})

    headers = await _login(async_client, "gt_staff")
    available = await async_client.get("/general-test/available", headers=headers)
    assert available.json()["tests"][0]["question_count"] == 2

    state = await async_client.post(f"/general-test/{test_id}/start", headers=headers)
    assert len(state.json()["questions"]) == 2
    result = await async_client.post(f"/general-test/attempt/{state.json()['attempt_id']}/finish", headers=headers)
    assert result.json()["total_questions"] == 2

    # Sozlangan son savollardan ko'p bo'lsa — borlari beriladi, start buzilmaydi.
    await auth_client.put(f"/general-test/{test_id}", json={"question_number": 50})
    state = await async_client.post(f"/general-test/{test_id}/start", headers=headers)
    assert state.status_code == 200
    assert len(state.json()["questions"]) == 3

    # `null` — yana hammasi.
    cleared = await auth_client.put(f"/general-test/{test_id}", json={"question_number": None})
    assert cleared.json()["question_number"] is None


def test_title_is_composed_from_subject_and_groups():
    from app.modules.general_test.repository import _compose_title

    assert _compose_title("Fizika", []) == "Fizika"
    assert _compose_title("Fizika", ["B-2", "A-1"]) == "Fizika — A-1, B-2"
    assert _compose_title("Fizika", ["E", "D", "C", "B", "A"]) == "Fizika — A, B, C va yana 2 ta guruh"


@pytest.mark.asyncio
async def test_title_follows_subject_and_groups(auth_client, scene):
    test_id = scene["test_id"]
    assert (await auth_client.get(f"/general-test/{test_id}")).json()["title"] == "Axborot xavfsizligi"

    added = await auth_client.post(
        f"/general-test/{test_id}/groups", json={"group_ids": [scene["other_group_id"], scene["group_id"]]}
    )
    assert added.json()["title"] == "Axborot xavfsizligi — GT-101, GT-202"

    removed = await auth_client.delete(f"/general-test/{test_id}/groups/{scene['other_group_id']}")
    assert removed.json()["title"] == "Axborot xavfsizligi — GT-101"

    renamed = await auth_client.put(f"/general-test/subject/{scene['subject_id']}", json={"name": "Kiberxavfsizlik"})
    assert renamed.status_code == 200
    assert (await auth_client.get(f"/general-test/{test_id}")).json()["title"] == "Kiberxavfsizlik — GT-101"

    other = await auth_client.post("/general-test/subject", json={"name": "Raqamli savodxonlik"})
    moved = await auth_client.put(f"/general-test/{test_id}", json={"subject_id": other.json()["id"]})
    assert moved.json()["title"] == "Raqamli savodxonlik — GT-101"

    # Guruhlar bilan birga yaratish — nom darhol tayyor.
    created = await auth_client.post(
        "/general-test/", json={"subject_id": other.json()["id"], "group_ids": [scene["other_group_id"]]}
    )
    assert created.status_code == 201
    assert created.json()["title"] == "Raqamli savodxonlik — GT-202"
    assert [g["id"] for g in created.json()["groups"]] == [scene["other_group_id"]]


@pytest.mark.asyncio
async def test_questions_live_in_subject_bank(auth_client, async_client, scene):
    subject_id = scene["subject_id"]
    bank = await auth_client.get(f"/general-test/subject/{subject_id}/questions")
    assert bank.status_code == 200
    assert [q["text"] for q in bank.json()["questions"]] == ["2+2?"]
    assert bank.json()["questions"][0]["subject_id"] == subject_id

    subject = await auth_client.get(f"/general-test/subject/{subject_id}")
    assert subject.json()["question_count"] == 1

    # Ikkinchi test ham o'sha bankdan oladi — o'zining savoli yo'q.
    second = await auth_client.post(
        "/general-test/", json={"subject_id": subject_id, "group_ids": [scene["group_id"]], "is_active": True}
    )
    assert second.json()["question_count"] == 1
    assert "questions" not in second.json()

    headers = await _login(async_client, "gt_student")
    state = await async_client.post(f"/general-test/{second.json()['id']}/start", headers=headers)
    assert state.status_code == 200, state.text
    assert [q["text"] for q in state.json()["questions"]] == ["2+2?"]

    # Bo'sh fanning testi boshlanmaydi.
    empty = await auth_client.post("/general-test/subject", json={"name": "Bo'sh fan"})
    lonely = await auth_client.post(
        "/general-test/",
        json={"subject_id": empty.json()["id"], "group_ids": [scene["group_id"]], "is_active": True},
    )
    refused = await async_client.post(f"/general-test/{lonely.json()['id']}/start", headers=headers)
    assert refused.status_code == 400


@pytest.mark.asyncio
async def test_group_can_be_hidden_without_unassigning(auth_client, async_client, scene):
    """Guruh uchun test yashiriladi: biriktirma qoladi, talaba ko'rmaydi."""
    test_id = scene["test_id"]
    added = await auth_client.post(
        f"/general-test/{test_id}/groups", json={"group_ids": [scene["group_id"], scene["other_group_id"]]}
    )
    assert added.status_code == 200, added.text
    assert all(g["is_active"] for g in added.json()["groups"])
    assert await _available(async_client, "gt_student") == [test_id]
    assert await _available(async_client, "gt_stranger") == [test_id]

    hidden = await auth_client.patch(
        f"/general-test/{test_id}/groups/{scene['group_id']}", json={"is_active": False}
    )
    assert hidden.status_code == 200, hidden.text
    state = {g["id"]: g["is_active"] for g in hidden.json()["groups"]}
    assert state == {scene["group_id"]: False, scene["other_group_id"]: True}

    # Yashirilgan guruh talabasi testni ko'rmaydi va boshlay olmaydi,
    # boshqa guruh esa ko'rishda davom etadi.
    assert await _available(async_client, "gt_student") == []
    start = await async_client.post(
        f"/general-test/{test_id}/start", headers=await _login(async_client, "gt_student")
    )
    assert start.status_code == 404
    assert await _available(async_client, "gt_stranger") == [test_id]

    shown = await auth_client.patch(
        f"/general-test/{test_id}/groups/{scene['group_id']}", json={"is_active": True}
    )
    assert shown.status_code == 200, shown.text
    assert await _available(async_client, "gt_student") == [test_id]

    missing = await auth_client.patch(f"/general-test/{test_id}/groups/999999", json={"is_active": True})
    assert missing.status_code == 404


@pytest.mark.asyncio
async def test_question_image_upload_and_html_question(auth_client, scene, monkeypatch, tmp_path):
    """Savol muharriri rasmni elementar bo'limning o'z manzili orqali yuklaydi
    va HTML matnli savol bankda shundayligicha saqlanadi."""
    from core.config import settings

    monkeypatch.setattr(settings.file_url, "upload_dir", str(tmp_path))
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64 + b"gt-question"
    uploaded = await auth_client.post(
        "/general-test/question/upload_image", files={"file": ("rasm.png", png, "image/png")}
    )
    assert uploaded.status_code == 200, uploaded.text
    url = uploaded.json()["url"]
    assert url

    html = f'<p>Rasmga qarang:</p><img src="{url}" alt="savol-rasm" />'
    created = await auth_client.post(
        f"/general-test/subject/{scene['subject_id']}/question",
        json={"text": html, "option_a": "<p>4</p>", "option_b": "3", "option_c": "5", "option_d": "6"},
    )
    assert created.status_code == 201, created.text
    assert created.json()["text"] == html
