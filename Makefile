.PHONY: help up down restart logs frontend-logs backend-logs face-logs monitoring-logs backup backup-database backup-logs backup-images restore merge deploy eduplan-sync eduplan-workloads eduplan-cron fix-image-urls fix-image-urls-apply

.DEFAULT_GOAL := help

# Show this help message with usage examples
help:
	@echo "╔════════════════════════════════════════════════════════════════╗"
	@echo "║                       Available commands                       ║"
	@echo "╚════════════════════════════════════════════════════════════════╝"
	@echo ""
	@echo "SERVICES:"
	@echo "──────────────────────────────────"
	@echo "make up               - Start all services"
	@echo "make down             - Stop all services"
	@echo "make restart          - Restart all services"
	@echo "make logs             - View logs for all services"
	@echo "make frontend-logs    - View frontend logs"
	@echo "make backend-logs     - View backend logs"
	@echo "make face-logs        - View face detection logs"
	@echo "make monitoring-logs  - View Loki/Promtail/Grafana logs"
	@echo "                        Grafana dashboard: http://localhost:3001"
	@echo ""
	@echo "BACKUP & RESTORE:"
	@echo "────────────────"
	@echo "make backup           - Backup database, logs, and images"
	@echo "make backup-database  - Backup only the PostgreSQL database"
	@echo "make backup-logs      - Backup only backend logs"
	@echo "make backup-images    - Backup only uploaded images"
	@echo "make restore FILE=path/to/backup.sql.gz - Restore (REPLACES all data) from backup"
	@echo "make merge   FILE=path/to/backup.sql.gz - Merge backup into current DB (non-destructive)"
	@echo "make fix-image-urls       - Show broken image URLs in the DB (dry run)"
	@echo "make fix-image-urls-apply - Rewrite them (dumps affected tables first)"
	@echo ""
	@echo "EDUPLAN (EPOS) SYNC:"
	@echo "────────────────────"
	@echo "make eduplan-sync      - Sync org-structure directories + workloads now"
	@echo "make eduplan-workloads - Sync only teacher workloads"
	@echo "make eduplan-cron      - Print the crontab line for a nightly 00:00 run"
	@echo ""

# Start development services (localhost, no nginx)
up:
	docker compose up -d --build

# Stop development services
down:
	docker compose down

# Restart development services
restart: down up

# View development logs
logs:
	docker compose logs -f

# View frontend logs
frontend-logs:
	docker compose logs -f frontend

# View backend logs
backend-logs:
	docker compose logs -f backend

# View face detection logs
face-logs:
	docker compose logs -f face-detection

# View monitoring stack logs (loki, promtail, grafana)
monitoring-logs:
	docker compose logs -f loki promtail grafana

# Backup everything (database, logs, and images)
backup: backup-database backup-logs backup-images

# Backup just the database
backup-database:
	./scripts/backup.sh

# Backup just the logs
backup-logs:
	./scripts/backup_logs.sh

# Backup just the images
backup-images:
	./scripts/backup_images.sh

# Restore database from backup file (DESTRUCTIVE — replaces all data)
restore:
	@if [ -z "$(FILE)" ]; then echo "Usage: make restore FILE=path/to/backup.sql.gz"; exit 1; fi
	./scripts/restore.sh $$(realpath $(FILE))

# Merge a backup into the current DB (non-destructive — existing rows kept, missing rows added)
merge:
	@if [ -z "$(FILE)" ]; then echo "Usage: make merge FILE=path/to/backup.sql.gz"; exit 1; fi
	./scripts/merge.sh $$(realpath $(FILE))

# Zero-Downtime Deployment (prod)
deploy:
	@./scripts/deploy.sh

# Sync org-structure directories and workloads from EduPlan (EPOS).
# Read-only towards EduPlan; conflicts and deactivations are left to an admin.
eduplan-sync:
	@./scripts/eduplan_sync.sh $(ARGS)

# Sync only teacher workloads (requires teachers/subjects/groups already linked)
eduplan-workloads:
	@./scripts/eduplan_sync.sh --workloads-only

# Print the crontab line for a nightly run at 00:00 server time
eduplan-cron:
	@echo "# EduPlan sync — nightly at 00:00 (server must be Asia/Tashkent)"
	@echo "0 0 * * * $(CURDIR)/scripts/eduplan_sync.sh >> /dev/null 2>&1"

# Run database migrations
migrate:
	docker exec nusmt_backend sh -c "cd /face/app && uv run alembic revision --autogenerate -m 'add_cheating_image_url'"
	docker cp nusmt_backend:/face/app/migrations/versions/. ./backend/app/migrations/versions/
	docker exec nusmt_backend sh -c "cd /face/app && uv run alembic upgrade head"
# Show what would be fixed in image URLs (dry run — changes nothing)
fix-image-urls:
	@./scripts/fix_image_urls.sh

# Actually rewrite image URLs (dumps questions + user_answers to backups/ first)
fix-image-urls-apply:
	@./scripts/fix_image_urls.sh --apply
