#!/bin/sh
# เริ่ม Alertmanager: เตรียม token แล้วเลือก config
#  - alertmanager.yml           = ส่งผ่าน backend อย่างเดียว (ใช้เสมอถ้าไม่ได้ตั้ง Telegram ตรง)
#  - alertmanager.telegram.yml  = เหมือนกัน + alert BackendDown ส่งตรงเข้า Telegram (ไม่พึ่ง backend)
# เปิดโหมดตรงเมื่อมีทั้ง TELEGRAM_BOT_TOKEN และ ALERT_TELEGRAM_CHAT_ID (ตัวเลข; กลุ่มเป็นเลขลบ)
set -eu
SRC=/etc/alertmanager-src

printf '%s' "${INTERNAL_AUTH_TOKEN:-}" > /tmp/am-token

CHAT="${ALERT_TELEGRAM_CHAT_ID:-}"
case "$CHAT" in
  ''|*[!0-9-]*) CHAT_OK=0 ;;
  *) CHAT_OK=1 ;;
esac

if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ "$CHAT_OK" = 1 ]; then
  printf '%s' "$TELEGRAM_BOT_TOKEN" > /tmp/tg-token
  sed "s/__CHAT_ID__/$CHAT/" "$SRC/alertmanager.telegram.yml" > /tmp/alertmanager.yml
  echo "[alertmanager] Telegram ตรง: เปิด (BackendDown ส่งเข้า chat $CHAT โดยไม่ผ่าน backend)"
else
  cp "$SRC/alertmanager.yml" /tmp/alertmanager.yml
  echo "[alertmanager] Telegram ตรง: ปิด (ตั้ง TELEGRAM_BOT_TOKEN + ALERT_TELEGRAM_CHAT_ID เพื่อเปิด)"
fi

exec /bin/alertmanager --config.file=/tmp/alertmanager.yml --storage.path=/alertmanager
