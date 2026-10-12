# แจ้งเตือนระบบ (Alertmanager → LINE / Telegram / อีเมล)

```
Prometheus (กฎใน deploy/prometheus/alerts.yml)
   └─► Alertmanager (รวมกลุ่ม/ส่งซ้ำ/แจ้งเมื่อหาย)
         └─► POST backend:3000/internal/alerts   (Bearer INTERNAL_AUTH_TOKEN, เฉพาะในเครือข่าย docker)
               └─► ผู้ดูแลระบบ (role=admin ที่ใช้งานได้) ทุกคน: ประวัติในแอป + ช่องทางที่ผูกไว้ (Telegram/LINE/อีเมล)
```
ใช้ช่องทางเดียวกับแจ้งเตือนอุปกรณ์ จึงไม่ต้องตั้ง token ใหม่ — **admin ต้องผูกช่องทางไว้ก่อน** (แอป → แจ้งเตือน → ตั้งค่า → เชื่อม Telegram/LINE/อีเมล)

## ตั้งค่า
- dev: ใน `.env` ต้องมี `INTERNAL_AUTH_TOKEN=<สตริงสุ่มยาวๆ>` (สร้างด้วย `[guid]::NewGuid().ToString("N")`) แล้ว `docker compose up -d --build backend alertmanager prometheus`
- prod: `INTERNAL_AUTH_TOKEN` มีอยู่แล้วจาก `deploy/init.sh`; `docker compose -f docker-compose.prod.yml up -d --build backend alertmanager prometheus`
- ระดับ `critical` (เช่น BackendDown) ส่งแม้อยู่ในช่วงเวลาเงียบของ admin; ระดับ warning ไม่ส่งในช่วงเงียบ (ยังเก็บในแอป)
- ปรับความถี่/การรวมกลุ่มที่ `deploy/alertmanager/alertmanager.yml` (ทั้ง dev และ prod ใช้ไฟล์เดียวกัน) ถ้าเปิด Telegram ตรง (ด้านล่าง) ให้แก้ `alertmanager.telegram.yml` คู่กันด้วย

## ทดสอบ (dev)
```powershell
# ยิง alert ทดลองเข้า Alertmanager (ถึงมือ admin ภายในประมาณ 30 วินาที ตาม group_wait)
$b = '[{"labels":{"alertname":"TestAlert","severity":"warning"},"annotations":{"summary":"ทดสอบแจ้งเตือนระบบ"}}]'
Invoke-RestMethod -Method Post -Uri http://localhost:9093/api/v2/alerts -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($b))
```
ดูสถานะ: http://localhost:9093 (Alertmanager) และ http://localhost:9090/alerts (Prometheus)
ทดสอบ webhook ตรง ๆ: `Invoke-RestMethod -Method Post -Uri "http://localhost:3000/internal/alerts?t=<INTERNAL_AUTH_TOKEN>" -ContentType application/json -Body '{"alerts":[{"status":"firing","labels":{"alertname":"X","severity":"critical"}}]}'`

## กฎที่มี
BackendDown (critical), IngestBacklog, IngestSlow, IngestDeadLetters, HighHttp5xxRate, EventLoopLagHigh — เพิ่มกฎใน `deploy/prometheus/alerts.yml` แล้ว restart prometheus (หรือ `curl -X POST localhost:9090/-/reload` ถ้าเปิด lifecycle)

## ข้อจำกัด
- ถ้า backend ล่ม การส่งผ่าน backend ทำไม่ได้ ใช้ "Telegram ตรง" ด้านล่างเพื่อให้ `BackendDown` ถึงมือแม้ backend ล่ม
- การแจ้งซ้ำทุก 4 ชั่วโมงขณะยังไม่หาย; เริ่มส่งหลังรอ 30 วินาที

## Telegram ตรง (กรณี backend ล่ม)

alert `BackendDown` ส่งผ่าน backend ไม่ได้เพราะ backend ล่มอยู่ จึงมีทางเลือกให้ Alertmanager ส่งเข้า Telegram เอง (เฉพาะ `BackendDown` alert อื่นยังผ่าน backend เหมือนเดิม):

1. ใช้บอตตัวเดิมที่ตั้ง `TELEGRAM_BOT_TOKEN` ไว้แล้ว (ตัวเดียวกับที่ผูกในแอป)
2. หา chat id ของคุณ: ผูก Telegram ในแอปแล้วดูที่ `docker exec -i iot-timescaledb psql -U iot -d iot_backend -c "select target from notification_channels where type='telegram';"` (กลุ่ม/แชนแนลเป็นเลขลบ)
3. ใส่ใน `.env` (prod: `deploy/.env.prod`):
   ```
   ALERT_TELEGRAM_CHAT_ID=<chat id>
   ```
   ใช้ตัวแปรนี้ ไม่ใช่ `TELEGRAM_CHAT_ID` เพราะตัวนั้นทำให้ backend ส่งทุกเหตุการณ์เข้าแชตนั้นด้วย (ซ้ำกับช่องที่ผูกในแอป)
4. สร้าง container ใหม่: `docker compose up -d --force-recreate alertmanager` (prod: `docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml up -d --force-recreate alertmanager`)
5. ตรวจ: `docker compose logs alertmanager --tail 5` ต้องเห็น `Telegram ตรง: เปิด` ถ้าเห็น `ปิด` แปลว่ายังไม่ได้ตั้งครบทั้ง `TELEGRAM_BOT_TOKEN` และ `ALERT_TELEGRAM_CHAT_ID` (ต้องเป็นตัวเลขล้วน)

ทดสอบโดยไม่ต้องหยุด backend: ยิง alert ชื่อ `BackendDown` เข้า Alertmanager ข้อความ 🔴 ควรเข้า Telegram ภายใน ~10 วินาที (ไม่ผ่าน backend):
```powershell
$b = '[{"labels":{"alertname":"BackendDown","severity":"critical"},"annotations":{"summary":"ทดสอบ Telegram ตรง"}}]'
Invoke-RestMethod -Method Post -Uri http://localhost:9093/api/v2/alerts -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($b))
```
ทดสอบจริงด้วยการหยุด backend: `docker compose stop backend` แล้วรอ ~1.5 นาที (Prometheus รอ 1 นาทีก่อนยิง) จากนั้น `docker compose start backend` ควรได้ข้อความ ✅ แก้ไขแล้วตามมา

หมายเหตุ: ค่า `chat_id` ถูกแทนลงไฟล์ config ตอนเริ่ม container ถ้าเปลี่ยนค่า ต้องสร้าง container ใหม่
