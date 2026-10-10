#!/usr/bin/env bash
# สำรองฐานข้อมูลเป็นไฟล์ .sql.gz ใน deploy/backups (เก็บ 14 ชุดล่าสุด)
# ตั้ง cron: 0 3 * * * cd /opt/iot-backend && bash deploy/backup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . deploy/.env.prod; set +a
mkdir -p deploy/backups
f="deploy/backups/db-$(date +%Y%m%d-%H%M%S).sql.gz"
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml exec -T timescaledb \
  pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$f"
ls -1t deploy/backups/db-*.sql.gz | tail -n +15 | xargs -r rm --
echo "สำรองแล้ว: $f"
