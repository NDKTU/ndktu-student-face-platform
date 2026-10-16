"""Qatlamlar: `core` modullarga bog'liq emas, modullar orasida import sikli yo'q.

`core` — poydevor (sozlama, baza, xatolar, umumiy yordamchilar). Ilgari
`core/utils` da kurs va dars ruxsatlari, ma'lumot doirasi kabi biznes-qoidalar
turardi va ular `modules` dan modellarni import qilardi — teskari bog'liqlik,
yangi import siklining eng ehtimolli joyi. Ular o'z modullariga ko'chirildi
(`modules/course/access.py`, `modules/auth/data_scope.py`, ...).

`core` dan modullarga faqat ilovani yig'adigan joylar qaraydi — ular uchun bu
tabiiy: `models_registry` (Alembic hamma modelni ko'rishi kerak), `lifespan`
(ishga tushishda rollar va EPOS jadvali), `dependencies` va `middleware`
(FastAPI'ga avtorizatsiyani ulash).
"""

import ast
import collections
import pathlib

APP_DIR = pathlib.Path(__file__).resolve().parents[1]

#: `core` ichida modullarni import qilishi mumkin bo'lgan yig'uvchi joylar.
_WIRING = ("core/database/models_registry.py", "core/lifespan/", "core/dependencies/", "core/middleware/")


def _module_graph() -> dict[str, set[str]]:
    def name(path: pathlib.Path) -> str:
        return ".".join(("app", *path.relative_to(APP_DIR).with_suffix("").parts)).removesuffix(".__init__")

    modules = {
        name(p): p for p in APP_DIR.rglob("*.py") if not {"test", "migrations", "scripts"} & set(p.relative_to(APP_DIR).parts)
    }

    def resolve(target: str) -> str | None:
        while target and target not in modules:
            target = target.rsplit(".", 1)[0] if "." in target else ""
        return target or None

    graph: dict[str, set[str]] = collections.defaultdict(set)
    for module, path in modules.items():
        package = module if path.name == "__init__.py" else module.rsplit(".", 1)[0]
        # Faqat modul darajasidagi importlar — sikl aynan ular orasida yuz beradi.
        for node in ast.parse(path.read_text(encoding="utf-8")).body:
            if isinstance(node, ast.Import):
                targets = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom):
                base = node.module or ""
                if node.level:
                    parts = package.split(".")
                    base = ".".join(parts[: len(parts) - node.level + 1] + ([base] if base else []))
                targets = [f"{base}.{alias.name}" for alias in node.names] + [base]
            else:
                continue
            for target in targets:
                resolved = resolve(target)
                if resolved and resolved != module:
                    graph[module].add(resolved)
    return graph


def test_core_does_not_depend_on_modules():
    offenders = sorted(
        f"{module} -> {target}"
        for module, targets in _module_graph().items()
        if module.startswith("app.core.")
        and not any(
            # `core/lifespan/__init__.py` — modul `app.core.lifespan`, slashsiz.
            module.replace(".", "/").removeprefix("app/").startswith(w.removesuffix(".py").rstrip("/"))
            for w in _WIRING
        )
        for target in targets
        if target.startswith("app.modules.")
    )
    assert not offenders, "core → modules bog'liqligi (yordamchini o'z moduliga ko'chiring):\n" + "\n".join(offenders)


def test_no_import_cycles():
    graph = _module_graph()
    state: dict[str, int] = {}
    stack: list[str] = []
    cycles: list[list[str]] = []

    def visit(node: str) -> None:
        state[node] = 1
        stack.append(node)
        for nxt in graph.get(node, ()):
            if state.get(nxt) == 1:
                cycles.append(stack[stack.index(nxt) :] + [nxt])
            elif not state.get(nxt):
                visit(nxt)
        stack.pop()
        state[node] = 2

    for node in list(graph):
        if not state.get(node):
            visit(node)
    assert not cycles, "Import sikllari:\n" + "\n".join(" -> ".join(c) for c in cycles[:10])
