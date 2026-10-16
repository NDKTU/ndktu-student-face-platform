"""OpenAPI sxemalari nomi yagona bo'lsin.

Bir xil nomli ikkita Pydantic modeli (masalan, `QuestionResponse`
psychology'da ham, general_test'da ham) bo'lsa, FastAPI qisqa nomni
birinchi import qilinganiga beradi, qolganlariga esa
`app__modules__..._QuestionResponse` kabi uzun nom. Import tartibi
o'zgarganda (fayl bo'linganda, import ko'tarilganda) hujjatdagi nomlar
«sakraydi». Shuning uchun modul prefiksli nomlar: `GeneralTest...`,
`Psychology...`.
"""

import app.main as main_module


def test_schema_names_are_unique():
    names = main_module.app.openapi()["components"]["schemas"]
    clashes = sorted(name.replace("app__modules__", "").replace("__", ".") for name in names if name.startswith("app__"))
    assert not clashes, "Bir xil nomli modellar — modul prefiksi bilan qayta nomlang: " + ", ".join(clashes)
