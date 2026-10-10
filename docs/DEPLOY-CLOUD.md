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

**เซนเซอร์/สวิตช์ผ่าน MQTT** — แต่ละอุปกรณ์มีรหัสของตัวเอง (ไม่มีรหัสร่วม)
1. เพิ่มอุปกรณ์ในแอป แล้วเปิด "แก้ไขอุปกรณ์" → กด "ออกรหัสเชื่อมต่อ MQTT"
2. แอปแสดง host/port/username/password **ครั้งเดียว** (บันทึกลงตัวอุปกรณ์ทันที) username คือ device id
3. ตั้งค่าอุปกรณ์: host `mqtt.example.com` พอร์ต `8883` เปิด TLS, clientId = username
4. อุปกรณ์ publish ได้เฉพาะ `devices/{device_id}/telemetry` และ `devices/{device_id}/ack` และ subscribe ได้เฉพาะ `devices/{device_id}/command` ของตัวเองเท่านั้น
5. รหัสหลุด/ทำเครื่องหาย → กด "ออกรหัสใหม่" (รหัสเก่าใช้ไม่ได้ทันทีที่เชื่อมต่อครั้งถัดไป) หรือ "เพิกถอน"

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


## 7) ความปลอดภัยเพิ่มเติม (เฟส E)

**ปิดสมัครแบบเปิด** — `REGISTRATION_MODE=invite` (ค่าเริ่มต้นของ production) ผู้ใช้คนแรกสมัครได้เสมอและเป็น admin คนถัดไปต้องมีรหัสเชิญ
สร้างรหัสเชิญ (ต้องล็อกอินเป็น admin; ใส่ `email` เพื่อผูกรหัสกับอีเมลนั้น, `days` = อายุ 1–30 วัน):
```powershell
$t = (Invoke-RestMethod https://api.example.com/auth/login -Method Post -ContentType 'application/json' -Body '{"email":"คุณ@mail.com","password":"รหัสผ่าน"}').access_token
Invoke-RestMethod https://api.example.com/invites -Method Post -Headers @{Authorization="Bearer $t"} -ContentType 'application/json' -Body '{"days":7}'
```
ส่ง `code` ที่ได้ให้ผู้ที่ต้องการเชิญ (เห็นครั้งเดียว) ดู/ยกเลิกใบเชิญ: `GET /invites`, `DELETE /invites/{id}` ตั้ง `REGISTRATION_MODE=closed` เพื่อปิดรับทั้งหมด

**สตรีมกล้อง (HLS) ต้องมีโทเคน** — ลิงก์ที่แอปได้รับมีโทเคนอายุ 12 ชั่วโมงฝังใน path (`STREAM_TOKEN_TTL_SECONDS` ปรับได้) ทุกคำขอถูก Caddy ส่งไปตรวจที่ backend ก่อน ผู้ที่รู้แค่ device id ดูสตรีมไม่ได้อีกต่อไป

**ยังไม่ได้ทำ:** RTSPS สำหรับเส้นทางส่งภาพกล้องขึ้น cloud (ตอนนี้ RTSP ธรรมดา ต้องมี user/password), MQTT ACL รายผู้ใช้สำหรับ client อื่นนอกจากอุปกรณ์และ backend

## 8) การแจ้งเตือนหลายช่องทาง (เฟส F)

การแจ้งเตือนส่งถึง "ผู้ที่มีสิทธิ์เห็นอุปกรณ์นั้น" (เจ้าของ ผู้ถูกแชร์ สมาชิกไซต์ และเจ้าของ rule) แต่ละคนผูกช่องทางของตัวเองในแอป: แท็บ แจ้งเตือน → ตั้งค่า
เลือกเหตุการณ์ที่ต้องการ และตั้งช่วงเวลาเงียบได้ (ช่วงเงียบยังบันทึกในแอป แต่ไม่ส่งออกภายนอก)

เซิร์ฟเวอร์ต้องตั้งค่าใน `deploy/.env.prod` (แล้ว `docker compose ... up -d` ใหม่):

| ช่องทาง | ตัวแปร | วิธีได้ค่า |
|---|---|---|
| Telegram | `TELEGRAM_BOT_TOKEN` | คุยกับ @BotFather พิมพ์ `/newbot` ผู้ใช้กด "+ Telegram" ในแอปแล้วเปิดบอตเพื่อผูกบัญชี ไม่ต้องตั้ง webhook |
| LINE | `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `LINE_BOT_BASIC_ID` | สร้าง Messaging API channel ที่ https://developers.line.biz แล้วตั้ง Webhook URL เป็น `https://api.<โดเมน>/integrations/line/webhook` เปิด "Use webhook" (LINE Notify ปิดบริการแล้ว จึงใช้ Messaging API) |
| อีเมล | `RESEND_API_KEY`, `EMAIL_FROM` | สมัคร https://resend.com ยืนยันโดเมนผู้ส่ง ส่งได้เฉพาะอีเมลของบัญชีผู้ใช้เอง |
| ช่องกลาง (ไม่บังคับ) | `TELEGRAM_CHAT_ID` | ถ้าตั้ง ทุกเหตุการณ์ของระบบจะเข้า chat นี้ด้วย |

หมายเหตุ: LINE Messaging API แผนฟรีจำกัดจำนวนข้อความ push ต่อเดือน ตรวจโควตาปัจจุบันที่ LINE Developers ก่อนใช้งานจริง

## 9) Web Admin (เฟส G)

1. เพิ่ม DNS record `admin.<โดเมน>` ชี้ IP เดียวกับ `api.<โดเมน>`
2. ถ้า `.env.prod` มีอยู่แล้ว รัน `bash deploy/init.sh` อีกครั้งเพื่อเติม `ADMIN_DOMAIN` (หรือเพิ่มเองเป็น `ADMIN_DOMAIN=admin.<โดเมน>`)
3. `docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build`
4. เปิด `https://admin.<โดเมน>` แล้วล็อกอินด้วยบัญชี admin (เมนู "ผู้ดูแล" เห็นเฉพาะ admin)

หมายเหตุ: `VITE_API_BASE_URL` ถูกฝังตอน build — ถ้าเปลี่ยน API_DOMAIN ต้อง build webadmin ใหม่
