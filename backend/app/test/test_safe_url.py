"""Havola sxemasini tekshirish (core/utils/safe_url.py) va uni chaqiruvchilar.

Nima uchun kerak: `javascript:alert(1)` matn maydoniga yozilganda hech qayerda
to'xtamasdi va bazaga tushardi. Sahifada uni React to'sadi, lekin himoya
ma'lumotda emas, bitta kutubxonaning xatti-harakatida bo'lib qolardi —
eksport, pochta xabari yoki `window.open(url)` uni to'smaydi.

Shu sababli tekshiruv ikki joyda sinaladi: funksiyaning o'zida va uni
chaqiradigan sxemalarda (dars materiali va e'lon) — havola API orqali
formani chetlab ham kelishi mumkin.
"""

import pytest
from pydantic import ValidationError

from app.core.utils.safe_url import UnsafeUrlError, normalize_optional_url, normalize_url
from app.modules.announcement.schemas import AnnouncementCreateRequest
from app.modules.course.resource.schemas import ResourceCreateRequest

# Sxemani yashirishga urinishlar: brauzer bularning hammasini `javascript:`
# deb o'qiydi, `urlsplit` esa ularni normallashtiradi.
DANGEROUS = [
    "javascript:alert(document.domain)",
    "JaVaScRiPt:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    " javascript:alert(1)",
    "\x01javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
]


@pytest.mark.parametrize("raw", DANGEROUS)
def test_dangerous_schemes_are_rejected(raw):
    with pytest.raises(UnsafeUrlError):
        normalize_url(raw)


def test_http_and_https_pass_unchanged():
    assert normalize_url("https://epmos.nsumt.uz/rest") == "https://epmos.nsumt.uz/rest"
    assert normalize_url("http://nsumt.uz") == "http://nsumt.uz"


def test_scheme_is_added_when_missing():
    """O'qituvchi havolani ko'pincha sxemasiz ko'chiradi."""
    assert normalize_url("epmos.nsumt.uz/rest") == "https://epmos.nsumt.uz/rest"
    assert normalize_url("  nsumt.uz  ") == "https://nsumt.uz"


def test_protocol_relative_link_does_not_get_doubled():
    assert normalize_url("//nsumt.uz/x") == "https://nsumt.uz/x"


@pytest.mark.parametrize("raw", ["", "   ", "https://", "not-a-url"])
def test_empty_or_domainless_values_are_rejected(raw):
    with pytest.raises(UnsafeUrlError):
        normalize_url(raw)


def test_optional_variant_treats_blank_as_absent():
    assert normalize_optional_url(None) is None
    assert normalize_optional_url("   ") is None
    assert normalize_optional_url("nsumt.uz") == "https://nsumt.uz"


@pytest.mark.parametrize("raw", DANGEROUS)
def test_resource_schema_rejects_dangerous_link(raw):
    """Material havolasi — forma ham, API ham shu sxemadan o'tadi."""
    with pytest.raises(ValidationError):
        ResourceCreateRequest(lesson_id=1, resource_type="link", title="QA", link_url=raw)


def test_resource_schema_normalizes_link():
    request = ResourceCreateRequest(lesson_id=1, resource_type="link", title="QA", link_url="nsumt.uz/kurs")

    assert request.link_url == "https://nsumt.uz/kurs"


@pytest.mark.parametrize("raw", DANGEROUS)
def test_announcement_schema_rejects_dangerous_link(raw):
    with pytest.raises(ValidationError):
        AnnouncementCreateRequest(title="QA", body="QA", link_url=raw)


def test_announcement_schema_normalizes_link():
    announcement = AnnouncementCreateRequest(title="QA", body="QA", link_url="nsumt.uz")

    assert announcement.link_url == "https://nsumt.uz"
