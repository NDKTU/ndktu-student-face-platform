"""Endpointga bog'lanmagan ruxsatlar reestri.

Ba'zi ruxsatlar route'da emas, kod ichida tekshiriladi (masalan, «barcha
fanlarni boshqarish» — `general_test/repository.py`), shuning uchun
`discover_permissions` ularni route'lardan topa olmaydi. `declare_permission`
ularni shu yerga yozadi; ishga tushishda boshqalar kabi bazaga tushadi va
Admin'ga beriladi.

DIQQAT: faqat `core.utils.permission_registry` yo'li bilan import qiling.
Loyihada `core.*` va `app.core.*` ikki alohida modul bo'lib yuklanadi —
boshqa yo'l bilan import qilingan reestr bo'sh qoladi va ruxsat jimgina
yaratilmaydi.
"""

DECLARED_PERMISSIONS: set[str] = set()


def declare_permission(name: str) -> str:
    DECLARED_PERMISSIONS.add(name)
    return name
