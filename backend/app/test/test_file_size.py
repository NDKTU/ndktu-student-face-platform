"""Fayllar o'lchami: 800 qatordan oshmasin.

`general_test/repository.py` 2053, `zoom_session/repository.py` 1357,
`auth/router.py` 1195 qatorga yetgan edi — ichida bir nechta alohida vazifa
yopishgan, o'qish va ko'rib chiqish qiyin. Ular vazifalar bo'yicha bo'lindi.

Chegara — kelishuv, qonun emas: maqsad yana 2000 ga o'smaslik. Hali
bo'linmagan katta fayllar quyida joriy o'lchami bilan yozilgan va faqat
kichrayishi mumkin (храповик). Faylni bo'lgach — ro'yxatdan olib tashlang.
"""

import pathlib

APP_DIR = pathlib.Path(__file__).resolve().parents[1]

LIMIT = 800

#: Hali bo'linmagan, 800 dan katta fayllar — 2026-10-16 dagi o'lcham.
LEGACY = {
    "modules/quiz/quiz/repository.py": 1134,
    "modules/auth/teacher/repository.py": 1011,
    "modules/integration/eduplan/service.py": 981,
    "modules/quiz/question/repository.py": 905,
    "modules/course/homework/repository.py": 888,
    "modules/course/router.py": 829,
}


def _sizes() -> dict[str, int]:
    return {
        str(path.relative_to(APP_DIR)): sum(1 for _ in path.open(encoding="utf-8"))
        for folder in ("modules", "core")
        for path in (APP_DIR / folder).rglob("*.py")
    }


def test_no_new_oversized_files():
    too_big = {name: n for name, n in _sizes().items() if n > LIMIT and name not in LEGACY}
    assert not too_big, (
        f"{LIMIT} qatordan katta fayllar — vazifalar bo'yicha bo'ling "
        f"(namuna: general_test/, zoom_session/): {too_big}"
    )


def test_legacy_files_only_shrink():
    sizes = _sizes()
    grown = {name: (limit, sizes.get(name, 0)) for name, limit in LEGACY.items() if sizes.get(name, 0) > limit}
    assert not grown, f"Katta fayl yana o'sdi (chegara, hozir): {grown}"
    done = sorted(name for name, limit in LEGACY.items() if sizes.get(name, 0) <= LIMIT)
    assert not done, f"Bu fayllar endi {LIMIT} dan kichik — `LEGACY` dan olib tashlang: {done}"
