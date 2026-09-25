#!/bin/bash
#
# Oʻchirilgan fayllarning baytlarini diskdan tozalash
# Usage: ./scripts/cleanup_files.sh [--apply] [--grace-days N]
#
# --apply'siz faqat nima oʻchirilishini koʻrsatadi. --apply bilan avval
# kutubxona jadvallarining dampini backups/ ga oladi, keyin oʻchiradi.
#
# Cron uchun (har kuni 03:30):
#   30 3 * * * /path/to/project/scripts/cleanup_files.sh --apply >> /dev/null 2>&1
#
# Tafsilotlar — app/modules/file/cleanup.py da.
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

CONTAINER="${BACKEND_CONTAINER:-nusmt_backend}"
DB_CONTAINER="${DB_CONTAINER:-database}"
LOG_DIR="${CLEANUP_LOG_DIR:-$PROJECT_DIR/logs}"
LOG_FILE="$LOG_DIR/cleanup_files.log"

mkdir -p "$LOG_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S%z')] $*" | tee -a "$LOG_FILE"
}

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    log "❌ $CONTAINER konteyneri ishlamayapti"
    exit 1
fi

# Damp faqat haqiqiy oʻchirishdan oldin: quruq yurish bazaga tegmaydi.
if [[ " $* " == *" --apply "* ]]; then
    DB_USER="$(docker exec "$CONTAINER" printenv POSTGRES_USER)"
    DB_NAME="$(docker exec "$CONTAINER" printenv POSTGRES_DB)"
    BACKUP_DIR="$PROJECT_DIR/backups"
    BACKUP_FILE="$BACKUP_DIR/before_file_cleanup_$(date +%Y-%m-%d_%H-%M-%S).sql.gz"

    mkdir -p "$BACKUP_DIR"
    log "📦 Kutubxona jadvallari dampi → $BACKUP_FILE"
    docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" \
        -t file_blobs -t files -t file_usages --data-only | gzip > "$BACKUP_FILE"
fi

set +e
docker exec "$CONTAINER" sh -c \
    "cd /face && uv run python app/scripts/cleanup_files.py $*" \
    2>&1 | tee -a "$LOG_FILE"
STATUS=${PIPESTATUS[0]}
set -e

if [[ "$STATUS" -ne 0 ]]; then
    log "❌ Tozalash $STATUS kodi bilan tugadi"
fi
exit "$STATUS"
