#!/bin/bash
#
# Audit jurnalini tozalash (standart: 90 kun)
# Usage: ./scripts/audit_cleanup.sh [--apply] [--days N]
#
# Cron uchun (har kuni 04:00):
#   0 4 * * * /path/to/project/scripts/audit_cleanup.sh --apply >> /dev/null 2>&1
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONTAINER="${BACKEND_CONTAINER:-nusmt_backend}"
LOG_DIR="${CLEANUP_LOG_DIR:-$PROJECT_DIR/logs}"
LOG_FILE="$LOG_DIR/audit_cleanup.log"

mkdir -p "$LOG_DIR"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S%z')] $*" | tee -a "$LOG_FILE"; }

log "Audit tozalash boshlandi: $*"
if docker exec "$CONTAINER" sh -c "cd /face/app && uv run python -m app.scripts.audit_cleanup $*" 2>&1 | tee -a "$LOG_FILE"; then
    log "Bajarildi"
else
    log "XATO: tozalash bajarilmadi"
    exit 1
fi
