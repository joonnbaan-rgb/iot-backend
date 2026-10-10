# ติดตั้งระบบบน cloud (VPS เครื่องเดียว)

เป้าหมาย: backend, ฐานข้อมูล, MQTT, MediaMTX รันบน VPS ให้แอปมือถือและอุปกรณ์ต่อผ่านอินเทอร์เน็ตด้วย HTTPS/TLS

## ภาพรวม

| บริการ | โดเมน / พอร์ต | ใคร/อะไรเชื่อมต่อ |
|---|---|---|
| API + WebSocket | `https://api.โดเมน` (443) | แอปมือถือ |
| สตรีมกล้อง (HLS) | `https://stream.โดเมน` (443) | แอปมือถือ |
| MQTT over TLS | `mqtt.โดเมน:8883` | เซนเซอร์/สวิตช์ (ESP32, Tasmota) |
| ส่งภาพกล้องขึ้น cloud | `stream.โดเมน:8554` (RTSP + รหัสผ่าน) | คอม/กล้องที่บ้านส่งขึ้นมา |

ไม่เปิดสู่อินเทอร์เน็ต: ฐานข้อมูล, redis, minio, EMQX dashboard, MediaMTX API

## 1) เตรียมเครื่องและโดเมน

1. เช่า VPS Ubuntu 22.04/24.04 (RAM อย่างน้อย 2 GB แนะนำ 4 GB, ดิสก์ 40 GB+) แล้วจดเลข IP ของเครื่อง
2. ซื้อโดเมน แล้วเพิ่ม DNS record ชนิด **A** ชี้ไปที่ IP ของ VPS 3 ชื่อ: `api`, `stream`, `mqtt` (เช่น `api.example.com`)
3. SSH เข้าเครื่อง แล้วติดตั้ง Docker: `curl -fsSL https://get.docker.com | sh`
4. เปิดไฟร์วอลล์ (ใน panel ของผู้ให้บริการ หรือ `ufw`) ให้เข้าได้เฉพาะ: **22, 80, 443, 8883, 8554**
   ```bash
   ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw allow 8883 && ufw allow 8554 && ufw enable
   ```
   (หมายเหตุ: พอร์ตที่ Docker เปิดเอง อาจข้าม ufw ได้ ชุดนี้จึงเปิดพอร์ตออกนอกเฉพาะที่จำเป็นตั้งแต่ใน compose)

## 2) ติดตั้ง

```bash
git clone https://github.com/joonnbaan-rgb/iot-backend.git /opt/iot-backend
cd /opt/iot-backend
bash deploy/init.sh example.com you@mail.com      # แทนด้วยโดเมนและอีเมลจริง
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml up -d --build
```

`init.sh` สุ่มรหัสผ่านทั้งหมดให้ แล้วเก็บใน `deploy/.env.prod` (สำรองไว้ที่ปลอดภัย ห้าม commit)

- รอ 1-2 นาทีให้ Caddy ขอใบรับรอง ถ้า `up` ฟ้องว่า `certsync` ไม่ healthy แปลว่า DNS ยังไม่ชี้มา ให้ตรวจ DNS แล้วรันคำสั่ง `up -d` ซ้ำ
- รัน migration ครั้งแรก:
  ```bash
  docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml exec backend npm run migration:run
  ```
- ทดสอบ: เปิด `https://api.example.com/health`

## 3) สร้างบัญชีผู้ดูแล

สมัครผ่านแอปหรือ API (`POST /auth/register`) บัญชีแรกที่สมัครเป็น admin อัตโนมัติ
**ข้อมูลเดิมจากเครื่องที่บ้านไม่ถูกย้ายมาเอง** — เริ่มระบบใหม่บน cloud ใช้ฐานข้อมูลใหม่ (ถ้าต้องการย้าย ให้ `pg_dump` จากเครื่องเดิมแล้ว restore ที่ cloud)

## 4) สร้างแอปมือถือให้ชี้ไป cloud

ใน `mobile-app/.env`:
```
EXPO_PUBLIC_API_BASE_URL=https://api.example.com
EXPO_PUBLIC_WS_URL=https://api.example.com
```
แล้ว build APK ใหม่ (`gradlew assembleRelease`) ติดตั้งทับ

## 5) ต่ออุปกรณ์

**เซนเซอร์/สวิตช์ผ่าน MQTT**
- host: `mqtt.example.com` พอร์ต `8883` เปิด TLS
- username/password: `MQTT_DEVICE_USER` / `MQTT_DEVICE_PASSWORD` ใน `deploy/.env.prod`
- topic: `devices/{device_id}/telemetry` และ `devices/{device_id}/ack` (รับคำสั่งที่ `devices/{device_id}/commands`)
- ⚠️ ตอนนี้อุปกรณ์ทุกตัวใช้ username/password เดียวกัน ยังไม่แยกสิทธิ์ราย device — ห้ามแจกรหัสนี้ให้คนที่ไม่ไว้ใจ

**กล้องที่บ้าน (ไม่ต้องเปิดพอร์ตที่เราเตอร์บ้าน)** — ให้คอมที่บ้านดึงภาพแล้วส่งขึ้น cloud:
```powershell
# เว็บแคมของคอม
.\scripts\webcam-stream.ps1 -Server stream.example.com:8554 -User publisher -Pass <RTSP_PUBLISH_PASS> -Path cam-<ตัวเลขสุ่ม>
# กล้อง IP ที่บ้าน (relay)
.\scripts\webcam-stream.ps1 -Server stream.example.com:8554 -User publisher -Pass <RTSP_PUBLISH_PASS> -Path cam-<ตัวเลขสุ่ม> -Source "rtsp://user:pass@192.168.1.50:554/stream1"
```
จากนั้นในแอป เพิ่มอุปกรณ์ชนิดกล้อง ตั้ง RTSP source เป็น `rtsp://127.0.0.1:8554/cam-<ตัวเลขสุ่ม>`
(ใช้ path ที่เดายาก เพราะผู้ที่รู้ชื่อ path ดูสตรีมนั้นได้)

## 6) ดูแลระบบ

- สำรองฐานข้อมูลทุกคืน: `crontab -e` เพิ่ม `0 3 * * * cd /opt/iot-backend && bash deploy/backup.sh`
- ใบรับรองต่ออายุเองทุก ~60 วัน แต่ EMQX ต้องรีสตาร์ตเพื่อโหลดใบใหม่: เพิ่ม cron เดือนละครั้ง
  `0 4 1 * * cd /opt/iot-backend && docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml restart emqx`
- อัปเดตโค้ด: `git pull && docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml up -d --build` แล้วรัน migration
- ดู log: `docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml logs -f backend`
- EMQX dashboard ไม่เปิดสู่ภายนอก เข้าผ่าน SSH tunnel เท่านั้น

## ข้อจำกัดที่ยังมี (ยังไม่ได้ทำ)

- ส่งภาพกล้องขึ้น cloud ด้วย RTSP ธรรมดา (พอร์ต 8554) รหัสผ่านไม่ถูกเข้ารหัสระหว่างทาง — ควรอัปเกรดเป็น RTSPS
- ลิงก์ดูสตรีม (HLS) ไม่ต้อง login ผู้ที่รู้ UUID ของอุปกรณ์ดูได้ — ควรเพิ่มโทเค็นอายุสั้น
- รหัส MQTT ใช้ร่วมกันทุกอุปกรณ์ — ควรออกรหัสแยกต่ออุปกรณ์
- ปุ่ม "สแกนหาอุปกรณ์" ในแอปสแกนวง LAN ของเซิร์ฟเวอร์ ซึ่งบน cloud จะไม่เจออะไร (ต้องมี gateway ที่บ้านทำแทน)
- ยังไม่มี CI/CD, การมอนิเตอร์ (Prometheus/Grafana เดิมไม่รวมในชุดนี้), และการสำรองข้อมูลไปนอกเครื่อง
