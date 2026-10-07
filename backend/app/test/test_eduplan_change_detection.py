"""EPMOS: shartli yoziladigan maydonlar ham oʻzgarish deb tanilsin.

Ikki maydon solishtirishdan butunlay chetda qolgandi — ular shartli
yoziladi, va «lobda» solishtirish ularni abadiy `update` holatida ushlab
turardi. Chetlashtirish esa teskari tomondan yomon chiqdi: EPMOS da
FAQAT shu maydon oʻzgarsa, satr `unchanged` deb topilib,
`_apply_one` darhol chiqib ketardi va yangi qiymat hech qachon
yozilmasdi.

Ikkala koʻr nuqtaning narxi aniq:

* `hemis_group_id` — EPOS da guruhga HEMIS bogʻlanishi qoʻyildi, boshqa
  hech narsa oʻzgarmadi. Bizda u paydo boʻlmasdi, talabalar importi esa
  aynan shu ustun boʻyicha odamlarni guruhlarga ajratadi — butun guruh
  talabasiz qolardi;
* `username` — EPMOS da oʻqituvchining logini almashtirildi, FIO oʻsha.
  Bizda eski login qolib, odam tizimga kira olmasdi.

Endi har biri oʻz qoidasi bilan solishtiriladi — yozish qoidasining
aynan oʻzi bilan.
"""

import pytest

from app.modules.integration.eduplan.service import eduplan_sync_service as svc


class _Row:
    """Koʻzgu satrining kerakli qismi."""

    def __init__(self, **fields):
        self.is_active = True
        self.__dict__.update(fields)


class _User:
    def __init__(self, username: str):
        self.username = username


def _up_to_date(row, changes) -> bool:
    return svc._is_up_to_date(row, changes, {})


# ── hemis_group_id ──────────────────────────────────────────────────────


def test_new_hemis_link_is_a_change():
    """Asosiy regressiya: EPOS da bogʻlanish paydo boʻldi — bu oʻzgarish."""
    row = _Row(name="101B-23", hemis_group_id=None, hemis_group_id_source=None)

    assert not _up_to_date(row, {"name": "101B-23", "hemis_group_id": "412"})


def test_same_hemis_link_is_not_a_change():
    """Bir xil qiymat — oʻzgarish emas."""
    row = _Row(name="101B-23", hemis_group_id="412", hemis_group_id_source="eduplan")

    assert _up_to_date(row, {"name": "101B-23", "hemis_group_id": "412"})


def test_blank_hemis_link_is_not_a_change():
    """Boʻsh qiymat hech qachon yozilmaydi, demak oʻzgarish ham emas.

    Aks holda EPOS da `hemis_id` toʻldirilmagan guruhlar har progonda
    `update` boʻlib turardi — aynan shundan qochish uchun bu maydon
    bir paytlar solishtirishdan olib tashlangandi.
    """
    row = _Row(name="101B-23", hemis_group_id="412", hemis_group_id_source="eduplan")

    assert _up_to_date(row, {"name": "101B-23", "hemis_group_id": ""})
    assert _up_to_date(row, {"name": "101B-23", "hemis_group_id": None})


def test_manual_link_is_not_touched():
    """Qoʻlda bogʻlangani ustun — u yozilmaydi, demak `update` ham kerak emas.

    `upsert_group` qoidasi shunday, va solishtirish undan ogʻishsa, satr
    abadiy `update` boʻlib qolardi.
    """
    row = _Row(name="101B-23", hemis_group_id="999", hemis_group_id_source="manual")

    assert _up_to_date(row, {"name": "101B-23", "hemis_group_id": "412"})


# ── username ────────────────────────────────────────────────────────────


def test_new_username_is_a_change():
    """Asosiy regressiya: EPMOS da login almashdi — bu oʻzgarish."""
    row = _Row(full_name="Familiya Ism", user=_User("eski_login"))

    assert not _up_to_date(row, {"full_name": "Familiya Ism", "username": "yangi_login"})


def test_same_username_is_not_a_change():
    row = _Row(full_name="Familiya Ism", user=_User("login"))

    assert _up_to_date(row, {"full_name": "Familiya Ism", "username": "login"})


def test_blank_username_is_not_a_change():
    """EPMOS login qaytarmasa, bor qiymat oʻchirilmaydi."""
    row = _Row(full_name="Familiya Ism", user=_User("login"))

    assert _up_to_date(row, {"full_name": "Familiya Ism", "username": ""})


def test_missing_user_relation_does_not_crash():
    """Bogʻlanish yuklanmagan boʻlsa ham yiqilmaydi.

    `index_by_external` oʻqituvchilar uchun `selectinload(Teacher.user)`
    bilan chaqiriladi, lekin solishtirish bunga tayanib qolmasligi kerak:
    `None` holida bu oddiygina «login boshqa» degani.
    """
    row = _Row(full_name="Familiya Ism", user=None)

    assert not _up_to_date(row, {"full_name": "Familiya Ism", "username": "login"})


# ── Qolgan maydonlar avvalgidek ─────────────────────────────────────────


def test_ordinary_field_still_compared():
    """Oddiy maydonlar xatti-harakati oʻzgarmadi."""
    row = _Row(name="Eski nom", hemis_group_id=None, hemis_group_id_source=None)

    assert not _up_to_date(row, {"name": "Yangi nom"})
    assert _up_to_date(row, {"name": "Eski nom"})


def test_inactive_row_is_always_a_change():
    """Nofaol satr qaytib kelsa — bu oʻzgarish, maydonlar bir xil boʻlsa ham."""
    row = _Row(name="101B-23", hemis_group_id="412", hemis_group_id_source="eduplan")
    row.is_active = False

    assert not _up_to_date(row, {"name": "101B-23", "hemis_group_id": "412"})
