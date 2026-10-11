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
- ปรับความถี่/การรวมกลุ่มที่ `deploy/alertmanager/alertmanager.yml` (dev ใช้สำเนาที่ `phase8/alertmanager/alertmanager.yml` — แก้ทั้งสองไฟล์ให้ตรงกัน)

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
- ถ้า backend ล่ม Alertmanager ส่งผ่าน backend ไม่ได้ (webhook ล้มเหลวจะลองใหม่เอง แต่ BackendDown จะไม่ถึงมือจนกว่า backend กลับมา) ถ้าต้องการแจ้งเตือนตอน backend ล่มจริงๆ ควรเพิ่ม receiver ตรงไป Telegram (`telegram_configs` ในไฟล์ alertmanager.yml ใช้ bot token ของคุณ)
- การแจ้งซ้ำทุก 4 ชั่วโมงขณะยังไม่หาย; เริ่มส่งหลังรอ 30 วินาที
