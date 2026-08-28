"""Одноразовая правка ссылок на картинки в базе.

Все ссылки на картинки вопросов были сохранены абсолютным URL с доменом
внутри: `https://test.api.nsumt.uz/uploads/questions/<uuid>.png`. После смены
домена они перестали открываться — файлы на месте, но браузер идёт на
несуществующий хост. Скрипт переводит их в относительный вид
`/uploads/question/<uuid>.png`, который отдаётся через nginx и переживает
любую следующую смену домена.

По умолчанию НИЧЕГО НЕ МЕНЯЕТ — показывает, что нашёл, и выходит. Правка
применяется только с флагом --apply.

Запуск в контейнере:

    # посмотреть, что найдено
    docker exec nusmt_backend sh -c "cd /face && uv run python app/scripts/fix_image_urls.py"

    # применить
    docker exec nusmt_backend sh -c "cd /face && uv run python app/scripts/fix_image_urls.py --apply"

Скрипт идемпотентен: повторный запуск не найдёт что править. То же самое
делает миграция b7d41e0c92aa — если она уже применена, скрипт покажет ноль.

Коды возврата:
    0 — отработал (в том числе если править было нечего);
    1 — не отработал: нет доступа к базе, ошибка при обновлении.
"""

import argparse
import asyncio
import sys
from pathlib import Path

# Скрипт запускают по пути, а не как модуль пакета, поэтому корень проекта и
# каталог app кладём на sys.path сами — импорты в проекте смешанные.
BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(BACKEND_ROOT), str(BACKEND_ROOT / "app")]

# isort: off
from sqlalchemy import text  # noqa: E402

from core.database.db_helper import db_helper  # noqa: E402

# isort: on

# Где в базе лежит HTML с <img src>. Ссылки на картинки хранятся не только в
# самих вопросах: user_answers держит снимок того, что студент видел при сдаче,
# и без правки история ответов осталась бы с битыми картинками.
TARGETS: dict[str, tuple[str, ...]] = {
    "questions": ("text", "option_a", "option_b", "option_c", "option_d"),
    "user_answers": ("answer", "correct_answer"),
}

# Сначала полная ссылка с хостом, потом относительная. Порядок важен: после
# первой замены в тексте остаётся `/uploads/question/` (единственное число), и
# второй шаблон (`questions`, множественное) его уже не поймает — то есть
# двойной замены не будет.
PATTERNS: tuple[str, ...] = (
    r"https?://[^/]*/uploads/questions/",
    r"/uploads/questions/",
)

REPLACEMENT = "/uploads/question/"

LIKE = "%/uploads/questions/%"


async def _count(session, table: str, column: str) -> int:
    result = await session.execute(
        text(f"SELECT count(*) FROM {table} WHERE {column} LIKE :like"),
        {"like": LIKE},
    )
    return result.scalar_one()


async def _sample(session, table: str, column: str) -> str | None:
    result = await session.execute(
        text(
            f"SELECT substring({column} from '[^\"'' >]*uploads/questions/[^\"'' >]*') "
            f"FROM {table} WHERE {column} LIKE :like LIMIT 1"
        ),
        {"like": LIKE},
    )
    return result.scalar_one_or_none()


async def run(apply: bool) -> int:
    total = 0
    async with db_helper.session_factory() as session:
        print("Найдено строк со старой ссылкой:\n")
        for table, columns in TARGETS.items():
            for column in columns:
                found = await _count(session, table, column)
                total += found
                mark = " " if found == 0 else "→"
                print(f"  {mark} {table}.{column}: {found}")

        if total == 0:
            print("\nПравить нечего — база уже в порядке.")
            return 0

        sample = None
        for table, columns in TARGETS.items():
            for column in columns:
                sample = sample or await _sample(session, table, column)
        print(f"\nВсего: {total}")
        print(f"Пример:  {sample}")
        print(f"Станет:  {REPLACEMENT}<имя файла>")

        if not apply:
            print("\nСухой прогон — база не изменена. Для правки: --apply")
            return 0

        print("\nПрименяю...")
        for table, columns in TARGETS.items():
            for column in columns:
                for pattern in PATTERNS:
                    await session.execute(
                        text(
                            f"UPDATE {table} "
                            f"SET {column} = regexp_replace({column}, :pattern, :replacement, 'g') "
                            f"WHERE {column} LIKE :like"
                        ),
                        {
                            "pattern": pattern,
                            "replacement": REPLACEMENT,
                            "like": LIKE,
                        },
                    )
        await session.commit()

        left = 0
        for table, columns in TARGETS.items():
            for column in columns:
                left += await _count(session, table, column)
        print(f"Готово. Осталось старых ссылок: {left}")
        return 0 if left == 0 else 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--apply",
        action="store_true",
        help="применить правку (без флага — только показать, что найдено)",
    )
    args = parser.parse_args()

    try:
        return asyncio.run(run(args.apply))
    except Exception as exc:  # noqa: BLE001 — скрипт, нужен понятный вывод, а не трейс
        print(f"Ошибка: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
