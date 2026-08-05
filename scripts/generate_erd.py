#!/usr/bin/env python3
"""Генератор ER-диаграммы БД в формате draw.io (mxGraph XML).

Схему берёт из живой базы (pg_class / pg_attribute / pg_constraint), а не из
моделей: так диаграмма гарантированно совпадает с тем, что реально применено
миграциями. Принадлежность таблицы модулю определяется по __tablename__ в
backend/app/modules/<модуль>/model.py.

Файл многостраничный — одно полотно на 37 таблиц нечитаемо, потому что
хаб-таблицы (users, groups, subjects, courses) собирают ссылки со всей базы:

    страница 1      обзор: только имена таблиц и связи между ними
    страницы 2..N   по одному модулю, все колонки; внешние таблицы показаны
                    компактными заглушками рядом, поэтому стрелки короткие

Запуск:
    python3 scripts/generate_erd.py
    # → docs/erd/ndktu-schema.drawio, открывается на app.diagrams.net

Требуется запущенный контейнер с PostgreSQL (имя и креды — в константах ниже
или через переменные окружения ERD_CONTAINER / ERD_DB_USER / ERD_DB_NAME).
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
MODULES_DIR = ROOT / "backend" / "app" / "modules"
OUT_PATH = ROOT / "docs" / "erd" / "ndktu-schema.drawio"

CONTAINER = os.environ.get("ERD_CONTAINER", "database")
DB_USER = os.environ.get("ERD_DB_USER", "nusmt")
DB_NAME = os.environ.get("ERD_DB_NAME", "basic_database")

SEP = "\x1f"  # разделитель полей: в данных схемы не встречается

# ── Геометрия ──────────────────────────────────────────────────────────────

ROW_H = 22
HEADER_H = 28
TABLE_W = 310
KEY_W = 38
TYPE_W = 96
NAME_W = TABLE_W - KEY_W - TYPE_W

STUB_W = 210
TABLE_GAP_X = 56
TABLE_GAP_Y = 40
STUB_GAP_Y = 26
ZONE_PAD = 30
ZONE_HEADER_H = 52
MAX_COL_H = 1250

# Обзорная страница
BOX_W = 190
BOX_H = 34
BOX_GAP_Y = 12
OV_ZONE_PAD = 22
OV_ZONE_HEADER_H = 40
OV_ZONE_GAP_X = 90
OV_ZONE_GAP_Y = 60

# ── Оформление зон ─────────────────────────────────────────────────────────
#   имя модуля: (заголовок, заливка зоны, контур, заливка шапки таблицы)

ZONE_STYLE = {
    "auth": ("Autentifikatsiya va shaxslar", "#E3F2FD", "#1565C0", "#BBDEFB"),
    "organization_structure": ("Tashkiliy tuzilma", "#E8F5E9", "#2E7D32", "#C8E6C9"),
    "quiz": ("Testlar va savollar", "#FFF3E0", "#EF6C00", "#FFE0B2"),
    "course": ("Kurslar va darslar", "#F3E5F5", "#6A1B9A", "#E1BEE7"),
    "psychology": ("Psixologiya", "#FCE4EC", "#AD1457", "#F8BBD0"),
    "other": ("Xizmat jadvallari", "#ECEFF1", "#455A64", "#CFD8DC"),
}
ZONE_ORDER = [
    "auth",
    "organization_structure",
    "quiz",
    "course",
    "psychology",
    "other",
]
# Сетка обзорной страницы: auth в центре — на него ссылается почти всё.
OVERVIEW_GRID = [
    ["organization_structure", "auth", "quiz"],
    ["psychology", "course", "other"],
]

DELETE_RULE = {"a": "", "r": "RESTRICT", "c": "CASCADE", "n": "SET NULL", "d": "SET DEFAULT"}

EDGE_BASE = (
    "edgeStyle=orthogonalEdgeStyle;rounded=1;html=1;jumpStyle=arc;jumpSize=10;"
    "startArrow=ERmany;startFill=0;endArrow=ERone;endFill=0;"
    "fontSize=10;fontColor=#C62828;labelBackgroundColor=#FFFFFF;"
)

# ── Чтение схемы ───────────────────────────────────────────────────────────


def psql(query: str) -> list[list[str]]:
    proc = subprocess.run(
        ["docker", "exec", CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME,
         "-tAF", SEP, "-c", query],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        sys.exit("psql завершился с ошибкой:\n%s" % proc.stderr.strip())
    return [line.split(SEP) for line in proc.stdout.strip().splitlines() if line]


COLUMNS_SQL = """
SELECT c.relname, a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull::text
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname, a.attnum
"""

PK_SQL = """
SELECT c.relname, a.attname
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN unnest(con.conkey) AS k(attnum) ON true
JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
WHERE con.contype = 'p' AND con.connamespace = 'public'::regnamespace
"""

FK_SQL = """
SELECT src.relname, sa.attname, tgt.relname, ta.attname, con.confdeltype
FROM pg_constraint con
JOIN pg_class src ON src.oid = con.conrelid
JOIN pg_class tgt ON tgt.oid = con.confrelid
JOIN unnest(con.conkey)  WITH ORDINALITY AS sk(attnum, ord) ON true
JOIN unnest(con.confkey) WITH ORDINALITY AS tk(attnum, ord) ON tk.ord = sk.ord
JOIN pg_attribute sa ON sa.attrelid = con.conrelid  AND sa.attnum = sk.attnum
JOIN pg_attribute ta ON ta.attrelid = con.confrelid AND ta.attnum = tk.attnum
WHERE con.contype = 'f' AND con.connamespace = 'public'::regnamespace
ORDER BY src.relname, sa.attname
"""

TYPE_SHORT = [
    (r"^character varying\((\d+)\)$", r"varchar(\1)"),
    (r"^character varying$", "varchar"),
    (r"^timestamp without time zone$", "timestamp"),
    (r"^timestamp with time zone$", "timestamptz"),
    (r"^double precision$", "float"),
    (r"^integer$", "int"),
    (r"^boolean$", "bool"),
]


def short_type(raw: str) -> str:
    for pattern, repl in TYPE_SHORT:
        if re.match(pattern, raw):
            return re.sub(pattern, repl, raw)
    return raw


def module_of_table() -> dict[str, str]:
    """__tablename__ → имя модуля, вычитанное из backend/app/modules/*/model.py."""
    mapping: dict[str, str] = {}
    for model_file in sorted(MODULES_DIR.glob("*/model.py")):
        module = model_file.parent.name
        for name in re.findall(r'__tablename__\s*=\s*"([^"]+)"', model_file.read_text()):
            mapping[name] = module
    return mapping


class Table:
    def __init__(self, name: str, columns: list[tuple[str, str, bool]],
                 pks: set[str], fks: set[str]):
        self.name = name
        self.columns = columns
        self.pks = pks
        self.fks = fks
        self.x = 0
        self.y = 0

    @property
    def height(self) -> int:
        return HEADER_H + ROW_H * len(self.columns)


# ── Примитивы XML ──────────────────────────────────────────────────────────


def cid(*parts: str) -> str:
    return re.sub(r"[^A-Za-z0-9_]", "_", "__".join(str(p) for p in parts))


def vertex(cell_id: str, value: str, style: str, x: int, y: int, w: int, h: int,
           parent: str = "1") -> str:
    return ('<mxCell id="%s" value="%s" style="%s" vertex="1" parent="%s">'
            '<mxGeometry x="%d" y="%d" width="%d" height="%d" as="geometry"/></mxCell>'
            % (cell_id, escape(value), style, parent, x, y, w, h))


def zone_box(cell_id: str, title: str, module: str, x: int, y: int, w: int, h: int,
             font: int = 20) -> str:
    _, fill, stroke, _ = ZONE_STYLE[module]
    style = (
        "rounded=1;arcSize=3;html=1;whiteSpace=wrap;fillColor=%s;strokeColor=%s;"
        "strokeWidth=2;verticalAlign=top;align=left;spacingLeft=16;spacingTop=8;"
        "fontSize=%d;fontStyle=1;fontColor=%s;" % (fill, stroke, font, stroke)
    )
    return vertex(cell_id, title, style, x, y, w, h)


def table_cells(t: Table, prefix: str, stroke: str, header_fill: str) -> list[str]:
    """Полная таблица со всеми колонками. Каждая строка — точка привязки для стрелок."""
    out = []
    tid = cid(prefix, "tbl", t.name)
    out.append(vertex(
        tid, t.name,
        "shape=table;startSize=%d;container=1;collapsible=0;childLayout=tableLayout;"
        "fixedRows=1;rowLines=0;fontStyle=1;align=center;resizeLast=1;html=1;"
        "fillColor=#FFFFFF;strokeColor=%s;strokeWidth=2;fontSize=14;fontColor=%s;"
        "swimlaneFillColor=%s;" % (HEADER_H, stroke, stroke, header_fill),
        t.x, t.y, TABLE_W, t.height))

    for i, (col, ctype, not_null) in enumerate(t.columns):
        rid = cid(prefix, "row", t.name, col)
        out.append(
            '<mxCell id="%s" value="" style="shape=tableRow;horizontal=0;startSize=0;'
            'swimlaneHead=0;swimlaneBody=0;fillColor=none;collapsible=0;dropTarget=0;'
            'points=[[0,0.5,0,0,0],[1,0.5,0,0,0]];portConstraint=eastwest;top=0;left=0;'
            'right=0;bottom=0;" vertex="1" parent="%s">'
            '<mxGeometry y="%d" width="%d" height="%d" as="geometry"/></mxCell>'
            % (rid, tid, HEADER_H + i * ROW_H, TABLE_W, ROW_H))

        is_pk, is_fk = col in t.pks, col in t.fks
        key = "PK" if is_pk else ("FK" if is_fk else "")
        key_color = "#B71C1C" if is_pk else ("#0D47A1" if is_fk else "#000000")
        cells = [
            ("key", key, 0, KEY_W,
             "align=center;fontSize=10;fontStyle=1;fontColor=%s;" % key_color),
            ("name", col, KEY_W, NAME_W,
             "align=left;spacingLeft=6;fontSize=12;%s" % ("fontStyle=1;" if is_pk else "")),
            ("type", short_type(ctype) + ("" if not_null else "?"),
             KEY_W + NAME_W, TYPE_W,
             "align=left;spacingLeft=4;fontSize=10;fontColor=#666666;"),
        ]
        for suffix, value, cx, cw, extra in cells:
            out.append(
                '<mxCell id="%s" value="%s" style="shape=partialRectangle;html=1;'
                'connectable=0;fillColor=none;top=0;left=0;bottom=0;right=0;'
                'overflow=hidden;%s" vertex="1" parent="%s">'
                '<mxGeometry x="%d" width="%d" height="%d" as="geometry">'
                '<mxRectangle width="%d" height="%d" as="alternateBounds"/>'
                '</mxGeometry></mxCell>'
                % (cid(prefix, "cell", t.name, col, suffix), escape(value), extra,
                   rid, cx, cw, ROW_H, cw, ROW_H))
    return out


def stub_cells(name: str, columns: list[str], module: str, x: int, y: int,
               prefix: str) -> tuple[list[str], int]:
    """Компактная заглушка внешней таблицы: имя модуля, имя таблицы и нужные колонки."""
    _, fill, stroke, _ = ZONE_STYLE[module]
    out = []
    height = HEADER_H + ROW_H * len(columns)
    tid = cid(prefix, "stub", name)
    out.append(vertex(
        tid, name,
        "shape=table;startSize=%d;container=1;collapsible=0;childLayout=tableLayout;"
        "fixedRows=1;rowLines=0;fontStyle=1;align=center;resizeLast=1;html=1;"
        "fillColor=#FFFFFF;strokeColor=%s;strokeWidth=2;dashed=1;dashPattern=6 4;"
        "fontSize=13;fontColor=%s;swimlaneFillColor=%s;"
        % (HEADER_H, stroke, stroke, fill),
        x, y, STUB_W, height))

    for i, col in enumerate(columns):
        rid = cid(prefix, "row", name, col)
        out.append(
            '<mxCell id="%s" value="" style="shape=tableRow;horizontal=0;startSize=0;'
            'swimlaneHead=0;swimlaneBody=0;fillColor=none;collapsible=0;dropTarget=0;'
            'points=[[0,0.5,0,0,0],[1,0.5,0,0,0]];portConstraint=eastwest;top=0;left=0;'
            'right=0;bottom=0;" vertex="1" parent="%s">'
            '<mxGeometry y="%d" width="%d" height="%d" as="geometry"/></mxCell>'
            % (rid, tid, HEADER_H + i * ROW_H, STUB_W, ROW_H))
        out.append(
            '<mxCell id="%s" value="%s" style="shape=partialRectangle;html=1;'
            'connectable=0;fillColor=none;top=0;left=0;bottom=0;right=0;overflow=hidden;'
            'align=center;fontSize=11;fontStyle=1;fontColor=#B71C1C;" vertex="1" parent="%s">'
            '<mxGeometry width="%d" height="%d" as="geometry">'
            '<mxRectangle width="%d" height="%d" as="alternateBounds"/>'
            '</mxGeometry></mxCell>'
            % (cid(prefix, "cell", name, col), escape(col), rid, STUB_W, ROW_H,
               STUB_W, ROW_H))
    return out, height


def edge(cell_id: str, label: str, source: str, target: str, color: str,
         dashed: bool = False) -> str:
    style = EDGE_BASE + "strokeColor=%s;strokeWidth=%s;%s" % (
        color, "1.5" if not dashed else "1.2",
        "dashed=1;dashPattern=6 4;" if dashed else "")
    return ('<mxCell id="%s" value="%s" style="%s" edge="1" parent="1" '
            'source="%s" target="%s"><mxGeometry relative="1" as="geometry"/></mxCell>'
            % (cell_id, escape(label), style, source, target))


def note(cell_id: str, html: str, x: int, y: int, w: int, h: int) -> str:
    style = ("rounded=1;arcSize=4;html=1;whiteSpace=wrap;fillColor=#FFFDE7;"
             "strokeColor=#F9A825;align=left;verticalAlign=top;spacing=10;fontSize=11;")
    return vertex(cell_id, html, style, x, y, w, h)


def page(name: str, page_id: str, cells: list[str]) -> str:
    return (
        '  <diagram name="%s" id="%s">\n'
        '    <mxGraphModel dx="1422" dy="800" grid="1" gridSize="10" guides="1" '
        'tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" '
        'pageWidth="1169" pageHeight="826" math="0" shadow="0">\n'
        '      <root>\n'
        '        <mxCell id="0"/>\n'
        '        <mxCell id="1" parent="0"/>\n'
        '        %s\n'
        '      </root>\n'
        '    </mxGraphModel>\n'
        '  </diagram>\n' % (escape(name), page_id, "\n        ".join(cells))
    )


# ── Страница 1: обзор ──────────────────────────────────────────────────────


def build_overview(tables: dict[str, Table], by_zone: dict[str, list[Table]],
                   fks: list[tuple[str, str, str, str, str]],
                   tbl_module: dict[str, str]) -> list[str]:
    cells: list[str] = []
    pos: dict[str, tuple[int, int]] = {}

    # Ширина/высота каждой зоны считается до размещения, чтобы выровнять сетку.
    dims = {}
    for module, zone_tables in by_zone.items():
        h = OV_ZONE_HEADER_H + len(zone_tables) * (BOX_H + BOX_GAP_Y) - BOX_GAP_Y + OV_ZONE_PAD
        dims[module] = (BOX_W + OV_ZONE_PAD * 2, h + OV_ZONE_PAD)

    y_cursor = 0
    for row in OVERVIEW_GRID:
        row_modules = [m for m in row if m in by_zone]
        if not row_modules:
            continue
        x_cursor = 0
        row_h = 0
        for module in row_modules:
            zw, zh = dims[module]
            title, _, stroke, _ = ZONE_STYLE[module]
            cells.append(zone_box(cid("ovzone", module),
                                  "%s  ·  %s" % (title, module),
                                  module, x_cursor, y_cursor, zw, zh, font=15))
            bx = x_cursor + OV_ZONE_PAD
            by = y_cursor + OV_ZONE_HEADER_H
            for t in by_zone[module]:
                style = ("rounded=1;arcSize=8;html=1;whiteSpace=wrap;fillColor=#FFFFFF;"
                         "strokeColor=%s;strokeWidth=2;fontSize=12;fontStyle=1;"
                         "fontColor=%s;" % (stroke, stroke))
                cells.append(vertex(cid("ovbox", t.name), t.name, style,
                                    bx, by, BOX_W, BOX_H))
                pos[t.name] = (bx, by)
                by += BOX_H + BOX_GAP_Y
            x_cursor += zw + OV_ZONE_GAP_X
            row_h = max(row_h, zh)
        y_cursor += row_h + OV_ZONE_GAP_Y

    # На обзоре рисуем ТОЛЬКО межмодульные связи. Внутримодульные полностью
    # видны на странице своего модуля, а здесь они дали бы 71 стрелку на 37
    # боксов — тот же клубок, от которого мы уходим. Кратные FK между одной
    # парой таблиц схлопываются в одну стрелку с пометкой ×N.
    pairs: dict[tuple[str, str], int] = {}
    for src_t, _, tgt_t, _, _ in fks:
        if src_t == tgt_t or src_t not in pos or tgt_t not in pos:
            continue
        if tbl_module.get(src_t) == tbl_module.get(tgt_t):
            continue
        pairs[(src_t, tgt_t)] = pairs.get((src_t, tgt_t), 0) + 1

    for n, ((src_t, tgt_t), count) in enumerate(sorted(pairs.items())):
        _, _, stroke, _ = ZONE_STYLE[tbl_module.get(tgt_t, "other")]
        cells.append(edge(cid("ovfk", n), "×%d" % count if count > 1 else "",
                          cid("ovbox", src_t), cid("ovbox", tgt_t), stroke))

    internal_total = sum(
        1 for s, _, t, _, _ in fks
        if s != t and tbl_module.get(s) == tbl_module.get(t))
    legend = (
        "<b>Qanday oʻqiladi</b><br><br>"
        "Bu sahifa — umumiy xarita. Bu yerda faqat <b>modullararo</b> bogʻlanishlar "
        "chizilgan: %d ta strelka.<br>"
        "Modul <i>ichidagi</i> %d ta bogʻlanish oʻz sahifasida — ustunlari, tiplari "
        "va oʻchirish qoidalari bilan (pastdagi ilovalar).<br><br>"
        "<b>→</b> strelka koʻp tomondan bir tomonga qaraydi (FK → PK).<br>"
        "<b>×N</b> — ikki jadval orasida N ta turli FK bor.<br>"
        "Strelka rangi — <i>qaysi</i> modulga havola qilinayotganini bildiradi."
        % (len(pairs), internal_total)
    )
    cells.append(note(cid("ovnote"), legend, 0, y_cursor + 10, 660, 170))
    return cells


# ── Страницы модулей ───────────────────────────────────────────────────────


def build_module_page(module: str, zone_tables: list[Table],
                      tables: dict[str, Table],
                      fks: list[tuple[str, str, str, str, str]],
                      tbl_module: dict[str, str]) -> list[str]:
    prefix = "m_" + module
    own = {t.name for t in zone_tables}
    _, _, stroke, header_fill = ZONE_STYLE[module]

    outgoing = [f for f in fks if f[0] in own and f[2] not in own]
    incoming = [f for f in fks if f[2] in own and f[0] not in own]
    internal = [f for f in fks if f[0] in own and f[2] in own]

    # Заглушки внешних таблиц — левой колонкой, чтобы стрелки шли в одну сторону.
    stub_targets: dict[str, set[str]] = {}
    for _, _, tgt_t, tgt_c, _ in outgoing:
        stub_targets.setdefault(tgt_t, set()).add(tgt_c)

    cells: list[str] = []
    stub_x = 0
    stub_y = ZONE_HEADER_H
    stub_bottom = stub_y
    for tgt_t in sorted(stub_targets):
        chunk, h = stub_cells(tgt_t, sorted(stub_targets[tgt_t]),
                              tbl_module.get(tgt_t, "other"), stub_x, stub_y, prefix)
        cells.extend(chunk)
        stub_y += h + STUB_GAP_Y
        stub_bottom = stub_y

    zone_x = (STUB_W + TABLE_GAP_X * 2) if stub_targets else 0

    # Внутри зоны таблицы пакуются по колонкам сверху вниз.
    col_x, cur_y, max_h = 0, 0, 0
    for t in sorted(zone_tables, key=lambda t: (-len(t.columns), t.name)):
        if cur_y and cur_y + t.height > MAX_COL_H:
            col_x += TABLE_W + TABLE_GAP_X
            cur_y = 0
        t.x = zone_x + ZONE_PAD + col_x
        t.y = ZONE_HEADER_H + cur_y
        cur_y += t.height + TABLE_GAP_Y
        max_h = max(max_h, cur_y - TABLE_GAP_Y)

    zone_w = col_x + TABLE_W + ZONE_PAD * 2
    zone_h = max_h + ZONE_HEADER_H + ZONE_PAD
    title, _, _, _ = ZONE_STYLE[module]
    cells.insert(0, zone_box(cid(prefix, "zone"), "%s  ·  %s" % (title, module),
                             module, zone_x, 0, zone_w, zone_h))

    for t in zone_tables:
        cells.extend(table_cells(t, prefix, stroke, header_fill))

    for n, (src_t, src_c, tgt_t, tgt_c, deltype) in enumerate(internal):
        cells.append(edge(cid(prefix, "in", n), DELETE_RULE.get(deltype, ""),
                          cid(prefix, "row", src_t, src_c),
                          cid(prefix, "row", tgt_t, tgt_c), stroke))

    for n, (src_t, src_c, tgt_t, tgt_c, deltype) in enumerate(outgoing):
        _, _, tgt_stroke, _ = ZONE_STYLE[tbl_module.get(tgt_t, "other")]
        cells.append(edge(cid(prefix, "out", n), DELETE_RULE.get(deltype, ""),
                          cid(prefix, "row", src_t, src_c),
                          cid(prefix, "row", tgt_t, tgt_c), tgt_stroke, dashed=True))

    # Входящие ссылки стрелками не рисуем — они пришли бы из таблиц, которых на
    # этой странице нет. Списком они читаются лучше, чем клубком заглушек.
    if incoming:
        lines = ["<b>Bu modulga tashqi havolalar</b>",
                 "<i>(qaysi jadvallar shu modulga bogʻlangan)</i>", ""]
        for src_t, src_c, tgt_t, tgt_c, deltype in sorted(incoming):
            rule = DELETE_RULE.get(deltype, "")
            lines.append("%s.%s &#8594; %s.%s%s" % (
                src_t, src_c, tgt_t, tgt_c,
                "  <font color='#C62828'>%s</font>" % rule if rule else ""))
        html = "<br>".join(lines)
        nx = zone_x + zone_w + TABLE_GAP_X
        cells.append(note(cid(prefix, "incoming"), html, nx, ZONE_HEADER_H, 380,
                          70 + 16 * len(incoming)))

    if stub_targets:
        html = ("<b>Tashqi jadvallar</b><br><i>(uzuq ramka — boshqa modul, "
                "toʻliq tarkibi oʻz sahifasida)</i>")
        cells.append(note(cid(prefix, "stubnote"), html, stub_x,
                          stub_bottom + 10, STUB_W, 70))

    return cells


# ── main ───────────────────────────────────────────────────────────────────


def main() -> None:
    cols_by_table: dict[str, list[tuple[str, str, bool]]] = {}
    for relname, attname, ctype, notnull in psql(COLUMNS_SQL):
        cols_by_table.setdefault(relname, []).append((attname, ctype, notnull == "t"))

    pks: dict[str, set[str]] = {}
    for relname, attname in psql(PK_SQL):
        pks.setdefault(relname, set()).add(attname)

    fks = [tuple(r) for r in psql(FK_SQL)]
    fk_cols: dict[str, set[str]] = {}
    for src_t, src_c, _, _, _ in fks:
        fk_cols.setdefault(src_t, set()).add(src_c)

    tbl_module_raw = module_of_table()
    tables = {
        name: Table(name, cols, pks.get(name, set()), fk_cols.get(name, set()))
        for name, cols in cols_by_table.items()
    }
    tbl_module = {name: tbl_module_raw.get(name, "other") for name in tables}

    by_zone: dict[str, list[Table]] = {}
    for name, t in tables.items():
        by_zone.setdefault(tbl_module[name], []).append(t)

    unknown = sorted(set(by_zone) - set(ZONE_ORDER))
    if unknown:
        sys.exit("Зоны не описаны в ZONE_ORDER: %s" % ", ".join(unknown))

    for zone_tables in by_zone.values():
        zone_tables.sort(key=lambda t: t.name)

    pages = [page("Umumiy koʻrinish", "ndktu-erd-overview",
                  build_overview(tables, by_zone, fks, tbl_module))]

    stats = []
    for module in ZONE_ORDER:
        zone_tables = by_zone.get(module)
        if not zone_tables:
            continue
        title = ZONE_STYLE[module][0]
        cells = build_module_page(module, zone_tables, tables, fks, tbl_module)
        pages.append(page(title, "ndktu-erd-" + module, cells))
        own = {t.name for t in zone_tables}
        stats.append((
            module, len(zone_tables),
            len([f for f in fks if f[0] in own and f[2] in own]),
            len([f for f in fks if f[0] in own and f[2] not in own]),
            len([f for f in fks if f[2] in own and f[0] not in own]),
        ))

    xml = ('<mxfile host="app.diagrams.net" type="device">\n%s</mxfile>\n'
           % "".join(pages))
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(xml, encoding="utf-8")

    print("%-26s %s" % ("файл", OUT_PATH.relative_to(ROOT)))
    print("%-26s %d (обзор + %d модулей)" % ("страниц", len(pages), len(stats)))
    print("%-26s %d" % ("таблиц", len(tables)))
    print("%-26s %d" % ("колонок", sum(len(c) for c in cols_by_table.values())))
    print("%-26s %d" % ("внешних ключей", len(fks)))
    print()
    print("%-24s %6s %9s %9s %9s" % ("модуль", "табл.", "внутри", "наружу", "входящих"))
    for module, n, internal, out, inc in stats:
        print("%-24s %6d %9d %9d %9d" % (module, n, internal, out, inc))


if __name__ == "__main__":
    main()
