#!/usr/bin/env bash
# เตรียมไฟล์ตั้งค่า production ครั้งแรก
#   bash deploy/init.sh example.com you@mail.com
# สร้าง: deploy/.env.prod (รหัสผ่านสุ่ม), deploy/emqx/auth.csv, deploy/mediamtx.prod.yml
# รันซ้ำได้: ถ้ามี .env.prod อยู่แล้วจะใช้ค่าเดิม ไม่สุ่มใหม่
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
cd "$(dirname "$0")"

if [ ! -f .env.prod ]; then
  if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
    echo "ใช้: bash deploy/init.sh <โดเมนหลัก เช่น example.com> <อีเมลสำหรับ Let's Encrypt>" >&2
    exit 1
  fi
  rnd() { openssl rand -hex "${1:-16}"; }
  cat > .env.prod <<ENV
API_DOMAIN=api.${DOMAIN}
STREAM_DOMAIN=stream.${DOMAIN}
MQTT_DOMAIN=mqtt.${DOMAIN}
ACME_EMAIL=${EMAIL}

DB_USER=iot
DB_NAME=iot_backend
DB_PASSWORD=$(rnd 16)

JWT_SECRET=$(rnd 32)

MINIO_ACCESS_KEY=minio$(rnd 4)
MINIO_SECRET_KEY=$(rnd 16)

EMQX_DASHBOARD_PASSWORD=$(rnd 12)
MQTT_BACKEND_PASSWORD=$(rnd 16)
# อุปกรณ์ใช้ชื่อผู้ใช้ dev-shared กับรหัสผ่านนี้ต่อ MQTT (ชั่วคราว จนกว่าจะมีรหัสแยกราย device)
MQTT_DEVICE_USER=dev-shared
MQTT_DEVICE_PASSWORD=$(rnd 16)

# ผู้ใช้/รหัสผ่านสำหรับส่งภาพกล้องจากบ้านขึ้น cloud (RTSP publish)
RTSP_PUBLISH_USER=publisher
RTSP_PUBLISH_PASS=$(rnd 16)

TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
ENV
  chmod 600 .env.prod
  echo "สร้าง deploy/.env.prod แล้ว (เก็บเป็นความลับ และสำรองไว้ที่ปลอดภัย)"
fi

set -a; . ./.env.prod; set +a

cat > emqx/auth.csv <<CSV
user_id,password,is_superuser
backend,${MQTT_BACKEND_PASSWORD},true
${MQTT_DEVICE_USER},${MQTT_DEVICE_PASSWORD},false
CSV
chmod 600 emqx/auth.csv

sed -e "s|__RTSP_PUBLISH_USER__|${RTSP_PUBLISH_USER}|" \
    -e "s|__RTSP_PUBLISH_PASS__|${RTSP_PUBLISH_PASS}|" \
    mediamtx.prod.yml.tpl > mediamtx.prod.yml
chmod 600 mediamtx.prod.yml

echo "พร้อมแล้ว ขั้นต่อไป:"
echo "  docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml up -d --build"
