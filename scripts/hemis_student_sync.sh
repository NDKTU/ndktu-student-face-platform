#!/bin/bash
#
# HEMIS talabalar importi
# Usage: ./scripts/hemis_student_sync.sh [--full] [--allow-bulk-create]
#
# Обёртка для системного cron: запускает импорт внутри контейнера бэкенда и
# пишет вывод в отдельный лог. Все аргументы пробрасываются в
# app/scripts/hemis_student_sync.py как есть.
#
# По умолчанию прогон инкрементальный. Полный обход — раз в неделю с --full.
#
# Пример строки crontab — каждый день в 00:00 по времени сервера:
#   0 0 * * * /path/to/project/scripts/hemis_student_sync.sh >> /dev/null 2>&1
#
# Сервер должен стоять в Asia/Tashkent, иначе «полночь» окажется чужой:
#   timedatectl set-timezone Asia/Tashkent
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

CONTAINER="${HEMIS_SYNC_CONTAINER:-nusmt_backend}"
LOG_DIR="${HEMIS_SYNC_LOG_DIR:-$PROJECT_DIR/logs}"
LOG_FILE="$LOG_DIR/hemis_student_sync.log"

mkdir -p "$LOG_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S%z')] $*" | tee -a "$LOG_FILE"
}

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    log "ОШИБКА: контейнер $CONTAINER не запущен, синхронизация пропущена"
    exit 1
fi

log "Запуск импорта студентов из HEMIS (аргументы: ${*:-нет})"

set +e
docker exec "$CONTAINER" sh -c \
    "cd /face && uv run python app/scripts/hemis_student_sync.py $*" \
    2>&1 | tee -a "$LOG_FILE"
STATUS=${PIPESTATUS[0]}
set -e

case "$STATUS" in
    0) log "Импорт завершён успешно" ;;
    2) log "Импорт пропущен: другой прогон уже идёт" ;;
    *) log "ОШИБКА: импорт завершился с кодом $STATUS" ;;
esac

exit "$STATUS"
