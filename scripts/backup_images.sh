#!/bin/bash
#
# Images/Uploads Backup Script
# Usage: ./scripts/backup_images.sh
#

set -euo pipefail

# ─── Config ──────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CONFIG_FILE="$PROJECT_DIR/.backup_config"

CUSTOM_PATH="${FILE:-${1:-}}"
if [ -n "$CUSTOM_PATH" ]; then
    if [[ "$CUSTOM_PATH" != /* ]]; then
        CUSTOM_PATH="$PWD/$CUSTOM_PATH"
    fi
    BACKUP_DIR_BASE="$CUSTOM_PATH"
    echo "BACKUP_DIR_BASE=\"$BACKUP_DIR_BASE\"" > "$CONFIG_FILE"
    echo "💾 Saved custom backup directory: $BACKUP_DIR_BASE"
elif [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
fi

BACKUP_DIR_BASE="${BACKUP_DIR_BASE:-$PROJECT_DIR/backups}"
BACKUP_DIR="$BACKUP_DIR_BASE/images"
# Uploads yo'li .env dagi UPLOADS_PATH bilan bir xil bo'lishi shart — aks holda
# skript bo'sh papkani arxivlab, "muvaffaqiyatli" deb yolg'on xabar beradi.
UPLOADS_PATH_ENV="$(grep -oP '^UPLOADS_PATH=\K.*' "$PROJECT_DIR/.env" 2>/dev/null || true)"
UPLOADS_DIR="${UPLOADS_PATH_ENV:-$PROJECT_DIR/backend/uploads}"
if [[ "$UPLOADS_DIR" != /* ]]; then
    UPLOADS_DIR="$PROJECT_DIR/${UPLOADS_DIR#./}"
fi
MAX_BACKUPS=10

# ─── Setup ───────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="$BACKUP_DIR/images_${TIMESTAMP}.tar.gz"

# ─── Check uploads directory ────────────────────────────
# Faqat papka bor-yo'qligini emas, ichida fayl bor-yo'qligini tekshiramiz:
# bo'sh papkalar skeleti `ls -A` ni aldab, bo'sh arxiv yaratilishiga olib kelgan.
if [ ! -d "$UPLOADS_DIR" ]; then
    echo "❌ Uploads directory not found: $UPLOADS_DIR"
    exit 1
fi

FILE_COUNT=$(find "$UPLOADS_DIR" -type f | wc -l)
if [ "$FILE_COUNT" -eq 0 ]; then
    echo "❌ No files to back up in $UPLOADS_DIR"
    exit 1
fi

# ─── Create backup ──────────────────────────────────────
echo "📦 Creating images backup: $BACKUP_FILE ($FILE_COUNT files from $UPLOADS_DIR)"

tar -czf "$BACKUP_FILE" -C "$(dirname "$UPLOADS_DIR")" "$(basename "$UPLOADS_DIR")/"

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "✅ Images backup complete: $SIZE"

# ─── Rotate old backups ─────────────────────────────────
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/images_*.tar.gz 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
    REMOVE_COUNT=$((BACKUP_COUNT - MAX_BACKUPS))
    echo "🔄 Rotating: removing $REMOVE_COUNT old backup(s)"
    ls -1t "$BACKUP_DIR"/images_*.tar.gz | tail -n "$REMOVE_COUNT" | xargs rm -f
fi

# ─── List backups ────────────────────────────────────────
echo ""
echo "📂 Image backups ($BACKUP_DIR):"
ls -lh "$BACKUP_DIR"/images_*.tar.gz 2>/dev/null | awk '{print "   " $NF " (" $5 ")"}'
