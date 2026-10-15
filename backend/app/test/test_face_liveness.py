"""Jonlilik (rasm/ekran emas, tirik yuz): `classify` qarori rejimga bog'liq.

`face-detection` faqat baholaydi (`is_live`, `liveness_score`), qarorni
bekend qiladi — `APP_CONFIG__FACE_SERVICE__LIVENESS_MODE`. Chegara hali
haqiqiy kadrlarda o'lchanmagan, shuning uchun standart `log`: hech kim rad
etilmaydi, faqat jurnalga yoziladi.
"""

import pytest
from core.config import settings

from app.core.utils.face_absence import FAILED_STATUSES
from app.core.utils.face_service import FACE_ENTRY_MESSAGES, classify

MATCH_NOT_LIVE = {"face_count": 1, "is_match": True, "reference_ready": True, "is_live": False, "liveness_score": 0.12}


def test_default_mode_only_logs():
    assert settings.face_service.liveness_mode == "log"


@pytest.mark.parametrize(
    ("mode", "expected"),
    [("off", "ok"), ("log", "ok"), ("enforce", "spoof")],
)
def test_not_live_face_depends_on_mode(monkeypatch, mode, expected):
    monkeypatch.setattr(settings.face_service, "liveness_mode", mode)
    assert classify(MATCH_NOT_LIVE) == expected


def test_spoof_wins_over_match(monkeypatch):
    # HEMIS suratining o'zi kamera oldiga tutilsa — yuz «mos keladi».
    # Aynan shuning uchun jonlilik moslikdan oldin tekshiriladi.
    monkeypatch.setattr(settings.face_service, "liveness_mode", "enforce")
    assert classify({**MATCH_NOT_LIVE, "is_match": True}) == "spoof"
    assert classify({**MATCH_NOT_LIVE, "is_match": False}) == "spoof"


@pytest.mark.parametrize("is_live", [True, None])
def test_live_or_unscored_face_is_judged_by_match(monkeypatch, is_live):
    # `None` — baholanmadi (model o'chiq yoki eski xizmat): yuz tekshiruvi
    # jonlilik yo'qligi uchun to'xtamasligi kerak.
    monkeypatch.setattr(settings.face_service, "liveness_mode", "enforce")
    result = {**MATCH_NOT_LIVE, "is_live": is_live}
    assert classify(result) == "ok"
    assert classify({**result, "is_match": False}) == "different_person"


def test_spoof_is_counted_and_explained():
    # Hisobotda talabani ayblaydigan holat va talabaga tushunarli matn.
    assert "spoof" in FAILED_STATUSES
    assert "rasm" in FACE_ENTRY_MESSAGES["spoof"]
