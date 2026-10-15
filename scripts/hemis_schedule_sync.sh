#!/bin/bash
#
# HEMIS dars jadvali sinxronizatsiyasi
# Usage: ./scripts/hemis_schedule_sync.sh [--year 2025] [--allow-bulk-deactivate]
#
# Обёртка для системного cron: запускает синк расписания внутри контейнера бэкенда и
# пишет вывод в отдельный лог. Все аргументы пробрасываются в
# app/scripts/hemis_schedule_sync.py как есть.
#
# По умолчанию — текущий учебный год, полный обход (~4,5 минуты).
#
# Пример строки crontab — каждый день в 03:00 по времени сервера:
#   0 3 * * * /path/to/project/scripts/hemis_schedule_sync.sh >> /dev/null 2>&1
#
# Сервер должен стоять в Asia/Tashkent, иначе «03:00» окажется чужим:
#   timedatectl set-timezone Asia/Tashkent
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

CONTAINER="${HEMIS_SYNC_CONTAINER:-nusmt_backend}"
LOG_DIR="${HEMIS_SYNC_LOG_DIR:-$PROJECT_DIR/logs}"
LOG_FILE="$LOG_DIR/hemis_schedule_sync.log"

mkdir -p "$LOG_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S%z')] $*" | tee -a "$LOG_FILE"
}

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    log "ОШИБКА: контейнер $CONTAINER не запущен, синхронизация пропущена"
    exit 1
fi

log "Запуск синка расписания из HEMIS (аргументы: ${*:-нет})"

set +e
docker exec "$CONTAINER" sh -c \
    "cd /face && uv run python app/scripts/hemis_schedule_sync.py $*" \
    2>&1 | tee -a "$LOG_FILE"
STATUS=${PIPESTATUS[0]}
set -e

case "$STATUS" in
    0) log "Синк расписания завершён успешно" ;;
    2) log "Синк расписания пропущен: другой прогон уже идёт" ;;
    *) log "ОШИБКА: синк расписания завершился с кодом $STATUS" ;;
esac

exit "$STATUS"
