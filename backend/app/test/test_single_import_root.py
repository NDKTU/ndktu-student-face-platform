"""Bitta modul — bitta nom.

Ilgari `app/` papkasi ham sys.path da edi (`app/main.py` fayl yo'li bilan
ishga tushirilardi, pytest `pythonpath` va skriptlar uni qo'shardi), shuning
uchun 162 joyda `from core...`, 228 joyda `from app.core...` yozilgan va
Python bitta faylni ikki modul sifatida yuklardi: 12 modul ikki marta, ikki
xil `settings`, ikki xil `redis_client`. Bir yo'l bilan qilingan monkeypatch
ikkinchisiga ta'sir qilmasdi, `isinstance`/`except` esa jimgina o'tib ketardi.
"""

import pathlib
import re
import sys

APP_DIR = pathlib.Path(__file__).resolve().parents[1]

_SECOND_ROOT = re.compile(r"^\s*(from|import)\s+(core|main)\b", re.MULTILINE)


def test_no_module_is_loaded_under_two_names():
    """Ilova import qilingach hech bir modul `X` va `app.X` bo'lib yuklanmagan."""
    import app.main  # noqa: F401 — butun ilovani yuklaydi

    twice = sorted(
        name for name in sys.modules if name.startswith("app.") and name.removeprefix("app.") in sys.modules
    )
    assert not twice, f"Ikki nom bilan yuklangan modullar: {twice}"


def test_sources_use_single_root():
    """Manbada `from core...` / `import main` qolmagan (ruff TID251 ham ushlaydi)."""
    offenders = [
        f"{path.relative_to(APP_DIR)}:{source[: m.start()].count(chr(10)) + 1}"
        for path in APP_DIR.rglob("*.py")
        for source in [path.read_text(encoding="utf-8")]
        for m in _SECOND_ROOT.finditer(source)
    ]
    assert not offenders, "Ikkinchi ildizdan import: " + ", ".join(offenders)


def test_app_directory_is_not_on_sys_path():
    """`app/` ning o'zi sys.path da bo'lsa, `core` yana import qilinadigan bo'ladi."""
    assert str(APP_DIR) not in {str(pathlib.Path(p).resolve()) for p in sys.path if p}
