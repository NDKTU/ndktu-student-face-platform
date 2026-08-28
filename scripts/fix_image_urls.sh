#!/bin/bash
#
# Одноразовая правка ссылок на картинки в базе
# Usage: ./scripts/fix_image_urls.sh [--apply]
#
# Без --apply только показывает, что нашёл, и ничего не меняет.
# С --apply сначала снимает дамп затронутых таблиц в backups/, потом правит.
#
# Подробности — в app/scripts/fix_image_urls.py.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

CONTAINER="${BACKEND_CONTAINER:-nusmt_backend}"
DB_CONTAINER="${DB_CONTAINER:-database}"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    echo "❌ Контейнер $CONTAINER не запущен"
    exit 1
fi

# Дамп только перед реальной правкой: сухой прогон базу не трогает, и снимать
# 180 тысяч строк ради него незачем.
if [[ " $* " == *" --apply "* ]]; then
    DB_USER="$(docker exec "$CONTAINER" printenv POSTGRES_USER)"
    DB_NAME="$(docker exec "$CONTAINER" printenv POSTGRES_DB)"
    BACKUP_DIR="$PROJECT_DIR/backups"
    BACKUP_FILE="$BACKUP_DIR/before_url_fix_$(date +%Y-%m-%d_%H-%M-%S).sql.gz"

    mkdir -p "$BACKUP_DIR"
    echo "📦 Дамп questions и user_answers → $BACKUP_FILE"
    docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" \
        -t questions -t user_answers --data-only | gzip > "$BACKUP_FILE"
    echo "   $(du -h "$BACKUP_FILE" | cut -f1)"
    echo ""
fi

docker exec "$CONTAINER" sh -c \
    "cd /face && uv run python app/scripts/fix_image_urls.py $*"
