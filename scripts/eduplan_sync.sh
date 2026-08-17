#!/bin/bash
#
# EduPlan (EPOS) Sync
# Usage: ./scripts/eduplan_sync.sh [--workloads-only] [--allow-bulk-create]
#
# Обёртка для системного cron: запускает синхронизацию внутри контейнера
# бэкенда и пишет вывод в отдельный лог. Все аргументы пробрасываются в
# app/scripts/eduplan_sync.py как есть.
#
# Пример строки crontab — каждый день в 00:00 по времени сервера:
#   0 0 * * * /path/to/project/scripts/eduplan_sync.sh >> /dev/null 2>&1
#
# Сервер должен стоять в Asia/Tashkent, иначе «полночь» окажется чужой:
#   timedatectl set-timezone Asia/Tashkent
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

CONTAINER="${EDUPLAN_SYNC_CONTAINER:-nusmt_backend}"
LOG_DIR="${EDUPLAN_SYNC_LOG_DIR:-$PROJECT_DIR/logs}"
LOG_FILE="$LOG_DIR/eduplan_sync.log"

mkdir -p "$LOG_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S%z')] $*" | tee -a "$LOG_FILE"
}

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    log "ОШИБКА: контейнер $CONTAINER не запущен, синхронизация пропущена"
    exit 1
fi

log "Запуск синхронизации с EduPlan (аргументы: ${*:-нет})"

set +e
docker exec "$CONTAINER" sh -c \
    "cd /face && uv run python app/scripts/eduplan_sync.py --triggered-by cron $*" \
    2>&1 | tee -a "$LOG_FILE"
STATUS=${PIPESTATUS[0]}
set -e

case "$STATUS" in
    0) log "Синхронизация завершена успешно" ;;
    2) log "Синхронизация пропущена: другой прогон уже идёт" ;;
    *) log "ОШИБКА: синхронизация завершилась с кодом $STATUS" ;;
esac

exit "$STATUS"
