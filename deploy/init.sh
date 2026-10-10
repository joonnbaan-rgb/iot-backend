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
ADMIN_DOMAIN=admin.${DOMAIN}
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
# ความลับภายใน: EMQX เรียก backend ตรวจรหัสอุปกรณ์ / ลงนามโทเคนสตรีม HLS
# (อุปกรณ์แต่ละตัวออกรหัส MQTT ของตัวเองผ่านแอป ไม่มีรหัสร่วมอีกต่อไป)
INTERNAL_AUTH_TOKEN=$(rnd 24)
STREAM_TOKEN_SECRET=$(rnd 32)
# open = ใครก็สมัครได้ | invite = ต้องมีรหัสเชิญจาก admin | closed = ปิดรับ (ผู้ใช้คนแรกสมัครได้เสมอ)
REGISTRATION_MODE=invite

# ผู้ใช้/รหัสผ่านสำหรับส่งภาพกล้องจากบ้านขึ้น cloud (RTSP publish)
RTSP_PUBLISH_USER=publisher
RTSP_PUBLISH_PASS=$(rnd 16)

# แจ้งเตือน: Telegram bot (สร้างจาก @BotFather) ผู้ใช้แต่ละคนผูกบัญชีของตัวเองในแอป
TELEGRAM_BOT_TOKEN=
# (ไม่บังคับ) chat กลางที่รับทุกเหตุการณ์ของระบบ
TELEGRAM_CHAT_ID=
# LINE Messaging API (LINE Notify ปิดบริการแล้ว) สร้างช่องที่ https://developers.line.biz
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
LINE_BOT_BASIC_ID=
# อีเมลผ่าน Resend (https://resend.com) EMAIL_FROM เช่น "IoT <alerts@example.com>"
RESEND_API_KEY=
EMAIL_FROM=
ENV
  chmod 600 .env.prod
  echo "สร้าง deploy/.env.prod แล้ว (เก็บเป็นความลับ และสำรองไว้ที่ปลอดภัย)"
fi

# .env.prod เก่า (ก่อนเฟส E) ยังไม่มีตัวแปรความปลอดภัยใหม่ เติมให้อัตโนมัติ
add_if_missing() { grep -q "^$1=" .env.prod || echo "$1=$2" >> .env.prod; }
add_if_missing INTERNAL_AUTH_TOKEN "$(openssl rand -hex 24)"
add_if_missing STREAM_TOKEN_SECRET "$(openssl rand -hex 32)"
add_if_missing REGISTRATION_MODE invite
add_if_missing ADMIN_DOMAIN "admin.$(grep '^API_DOMAIN=' .env.prod | cut -d= -f2 | sed 's/^api\.//')"
for v in LINE_CHANNEL_ACCESS_TOKEN LINE_CHANNEL_SECRET LINE_BOT_BASIC_ID RESEND_API_KEY EMAIL_FROM; do add_if_missing $v ""; done

set -a; . ./.env.prod; set +a

cat > emqx/auth.csv <<CSV
user_id,password,is_superuser
backend,${MQTT_BACKEND_PASSWORD},true
CSV
chmod 600 emqx/auth.csv

sed -e "s|__RTSP_PUBLISH_USER__|${RTSP_PUBLISH_USER}|" \
    -e "s|__RTSP_PUBLISH_PASS__|${RTSP_PUBLISH_PASS}|" \
    mediamtx.prod.yml.tpl > mediamtx.prod.yml
chmod 600 mediamtx.prod.yml

echo "พร้อมแล้ว ขั้นต่อไป:"
echo "  docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml up -d --build"
