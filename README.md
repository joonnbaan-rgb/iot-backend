# IoT Backend — Phase 1: Infra & Core Setup

โครงโปรเจกต์นี้ครอบคลุม Phase 1 ตามแผน: Docker Compose (EMQX, TimescaleDB, Redis) + NestJS scaffold + schema/migration เบื้องต้น + health check เพื่อยืนยันว่าทุก service เชื่อมต่อกันได้

## สิ่งที่ต้องมีก่อนเริ่ม
- Docker และ Docker Compose
- Node.js 20+ (สำหรับรัน migration และพัฒนาแบบ local)

## ขั้นตอนการรัน

1. คัดลอกไฟล์ env ตัวอย่าง:
   ```bash
   cp .env.example .env
   ```

2. ติดตั้ง dependencies (รันบนเครื่องที่มีอินเทอร์เน็ต):
   ```bash
   npm install
   ```

3. สั่งรัน infrastructure ทั้งหมด:
   ```bash
   docker-compose up -d timescaledb redis emqx
   ```
   รอสักครู่ให้ TimescaleDB พร้อม (มี healthcheck ในตัวแล้ว)

4. รัน migration เพื่อสร้างตาราง `users`, `devices`, `sensor_data` (แปลงเป็น hypertable แล้ว), `device_commands`:
   ```bash
   npm run migration:run
   ```

5. Build และรัน backend:
   - แบบ container: `docker-compose up -d --build backend`
   - หรือแบบ local dev: `npm run start:dev`

6. ตรวจสอบว่าทุกอย่างเชื่อมต่อกันสำเร็จ:
   ```bash
   curl http://localhost:3000/health
   ```
   ควรได้ผลลัพธ์ประมาณนี้เมื่อทุกอย่างพร้อม:
   ```json
   {
     "status": "ok",
     "services": {
       "database": "connected",
       "redis": "connected",
       "mqtt": "connected"
     }
   }
   ```

7. ทดสอบสร้างอุปกรณ์ตัวอย่าง:
   ```bash
   curl -X POST http://localhost:3000/devices \
     -H "Content-Type: application/json" \
     -d '{"name": "เซนเซอร์อุณหภูมิห้องนั่งเล่น", "type": "sensor", "location": "living_room"}'

   curl http://localhost:3000/devices
   ```

8. เปิด EMQX dashboard ดูสถานะ broker ได้ที่ `http://localhost:18083` (login: `admin` / `public`)

## โครงสร้างไฟล์
```
iot-backend/
├── docker-compose.yml       # infra ทั้งหมด: TimescaleDB, Redis, EMQX, backend
├── Dockerfile               # build backend เป็น container
├── .env.example             # ตัวแปรแวดล้อมตัวอย่าง
├── package.json
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/data-source.ts        # TypeORM data source (ใช้ทั้ง migration CLI และแอป)
│   ├── migrations/                  # migration สร้าง schema เริ่มต้น
│   ├── devices/                     # device registry (CRUD พื้นฐาน)
│   ├── users/entities/               # entity ผู้ใช้ (ใช้เต็มรูปแบบใน phase 6 - auth)
│   ├── sensor-data/entities/         # entity ข้อมูล telemetry (ใช้เต็มรูปแบบใน phase 2)
│   ├── device-commands/entities/     # entity ประวัติคำสั่ง (ใช้เต็มรูปแบบใน phase 3)
│   ├── mqtt/                         # เชื่อมต่อ MQTT broker (แค่ connect เพื่อทดสอบใน phase นี้)
│   └── health/                       # health check endpoint
```

## Local dev vs รันเป็น container

`.env.example` ตั้งค่า `DB_HOST=timescaledb`, `REDIS_HOST=redis`, `MQTT_URL=mqtt://emqx:1883` ไว้ — ชื่อเหล่านี้ใช้ได้เฉพาะตอนที่ **backend รันเป็น container ใน docker-compose network เดียวกัน** เท่านั้น

ถ้าคุณรันแบบ **local dev** (`npm run start:dev` บนเครื่องตรงๆ ไม่ผ่าน container) ต้องแก้ `.env` เป็น:
```env
DB_HOST=localhost
REDIS_HOST=localhost
MQTT_URL=mqtt://localhost:1883
MEDIAMTX_API_URL=http://localhost:9997
MINIO_ENDPOINT=localhost
RECORDINGS_DIR=./recordings
```
เพราะ docker-compose publish port ออกมาที่ `localhost` ของเครื่องคุณอยู่แล้ว แต่ชื่อ service ภายในจะเข้าถึงได้จากใน container เท่านั้น ส่วน `RECORDINGS_DIR` ใช้ `./recordings` ได้ตรงๆ เพราะเป็น bind mount ธรรมดา (ไม่ใช่ named volume) ไฟล์จริงจึงอยู่ในโฟลเดอร์ `recordings/` ข้างๆ โปรเจกต์นี้เอง เข้าถึงได้ทั้งจาก container และจากเครื่อง host ตรงๆ

## หมายเหตุสำคัญ
- `synchronize: false` ใน TypeORM โดยตั้งใจ — ใช้ migration ควบคุม schema เสมอ ไม่ให้ auto-sync ทำลายข้อมูลจริงโดยไม่ตั้งใจ
- ตาราง `sensor_data` ถูกแปลงเป็น **hypertable** ของ TimescaleDB แล้วตั้งแต่ migration แรก เพื่อรองรับข้อมูล time-series ปริมาณมากตั้งแต่ต้น
- `mqtt.service.ts` ตอนนี้แค่เชื่อมต่อและ log สถานะ (ตามเป้าหมาย Phase 1) — การ subscribe topic จริงและบันทึกข้อมูลจะเพิ่มใน **Phase 2: Device ingestion pipeline**
- ยังไม่มีระบบ auth ใน endpoint ต่างๆ (จะเพิ่มใน **Phase 6**) ดังนั้นอย่านำไปเปิดสู่อินเทอร์เน็ตตรงๆ ในตอนนี้

## Deliverable ของ Phase 1 (เช็คให้ผ่านก่อนไป Phase 2)
- [ ] `docker-compose up` รันได้ครบทุก service โดยไม่ error
- [ ] `npm run migration:run` สร้างตารางสำเร็จ และ `sensor_data` เป็น hypertable แล้ว
- [ ] `GET /health` ตอบกลับ `"status": "ok"` ครบทั้ง 3 service
- [ ] สร้างและดึงข้อมูลอุปกรณ์ผ่าน `POST /devices` และ `GET /devices` ได้

---

# Phase 2: Device Ingestion Pipeline

เพิ่ม pipeline รับข้อมูล telemetry จริงจาก MQTT บันทึกลง TimescaleDB และจัดการสถานะ online/offline อัตโนมัติ

## สิ่งที่เพิ่มเข้ามา
- **`IngestionService`** (`src/ingestion/`) — validate payload ด้วย `class-validator`, บันทึกลง `sensor_data`, อัปเดต device เป็น `online` พร้อมจำ `last_seen_at`
- **Offline watcher** — cron job ทุก 15 วินาที (`@Interval`) เช็คอุปกรณ์ที่ `last_seen_at` เกิน `DEVICE_OFFLINE_THRESHOLD_SECONDS` (default 30s) แล้ว mark เป็น `offline` อัตโนมัติ
- **`MqttService`** อัปเดตให้ subscribe topic `devices/+/telemetry` จริง แล้วส่งต่อเข้า `IngestionService`
- **`GET /devices/:deviceId/telemetry`** — ดึงข้อมูลย้อนหลัง รองรับ query `?limit=&from=&to=`
- Migration ใหม่เพิ่มคอลัมน์ `last_seen_at` ในตาราง `devices`
- **`scripts/simulate-sensor.js`** — จำลองเซนเซอร์ส่งข้อมูลจริง โดยไม่ต้องมีอุปกรณ์จริงหรือติดตั้ง mosquitto client

## รูปแบบ MQTT topic
```
devices/{device_id}/telemetry     <-- อุปกรณ์ publish ข้อมูลมาที่นี่
```

## รูปแบบ payload (JSON)
```json
{
  "value": 25.4,
  "unit": "celsius",
  "recorded_at": "2026-09-27T12:00:00.000Z"
}
```
- `value` — จำเป็นต้องมี (ตัวเลข)
- `unit` — ไม่บังคับ
- `recorded_at` — ไม่บังคับ ถ้าไม่ส่งมาจะใช้เวลาที่ backend รับ message แทน

## ขั้นตอนการทดสอบ

1. รัน migration ใหม่เพื่อเพิ่มคอลัมน์ `last_seen_at`:
   ```bash
   npm run migration:run
   ```

2. รัน dependencies เพิ่ม (มี `@nestjs/schedule` เพิ่มเข้ามา):
   ```bash
   npm install
   ```

3. Restart backend:
   ```bash
   npm run start:dev
   ```
   ควรเห็น log: `subscribe "devices/+/telemetry" สำเร็จ`

4. สร้างอุปกรณ์ (หรือใช้ device เดิมจาก Phase 1) แล้วจด `id` ที่ได้ไว้

5. รัน simulator ส่งข้อมูลจำลองเข้าไป (แทนที่ `<device_id>` ด้วย id จริง):
   ```bash
   node scripts/simulate-sensor.js <device_id>
   ```

6. เช็คว่าอุปกรณ์กลายเป็น `online` แล้ว:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:3000/devices/<device_id>" -Method Get
   ```

7. ดึงข้อมูล telemetry ย้อนหลัง:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:3000/devices/<device_id>/telemetry?limit=10" -Method Get
   ```

8. หยุด simulator (`Ctrl+C`) แล้วรอ ~30-45 วินาที เช็คอุปกรณ์อีกครั้ง — สถานะควรเปลี่ยนเป็น `offline` อัตโนมัติ

## Deliverable ของ Phase 2 (เช็คให้ผ่านก่อนไป Phase 3)
- [ ] Backend log แสดงว่า subscribe topic `devices/+/telemetry` สำเร็จ
- [ ] รัน simulator แล้วข้อมูลถูกบันทึกลง `sensor_data` จริง (ดึงผ่าน `GET /devices/:id/telemetry` เห็นข้อมูล)
- [ ] อุปกรณ์เปลี่ยนสถานะเป็น `online` ทันทีที่มีข้อมูลเข้ามา
- [ ] หยุดส่งข้อมูลแล้วรอเกิน threshold ที่ตั้งไว้ อุปกรณ์เปลี่ยนเป็น `offline` เองโดยไม่ต้องรีสตาร์ท backend
- [ ] ส่ง payload ผิดรูปแบบ (เช่น `value` เป็น string) แล้วระบบไม่ crash แค่ log warning และไม่บันทึกข้อมูล

---

# Phase 3: Actuator Control

เพิ่มความสามารถสั่งเปิด/ปิดอุปกรณ์ไฟฟ้าจริง พร้อมติดตามผลว่าอุปกรณ์ทำตามคำสั่งสำเร็จหรือไม่

## สิ่งที่เพิ่มเข้ามา
- **`CommandsService`** (`src/commands/`) — สร้าง command (`pending`) → publish ผ่าน MQTT → รอ ack → อัปเดตเป็น `success`/`failed`/`timeout`
- **`POST /devices/:deviceId/commands`** — สั่งงานอุปกรณ์ เช่น `{ "action": "turn_on" }`
- **`GET /devices/:deviceId/commands`** — ดูประวัติคำสั่งของอุปกรณ์
- **`GET /devices/:deviceId/commands/:commandId`** — เช็คสถานะคำสั่งเดียว (ใช้ poll ผลลัพธ์)
- **Timeout handling** — ถ้าอุปกรณ์ไม่ตอบ ack ภายใน `COMMAND_TIMEOUT_MS` (default 10 วินาที) จะถูก mark เป็น `timeout` อัตโนมัติ
- **`scripts/simulate-actuator.js`** — จำลองอุปกรณ์ไฟฟ้าที่รับคำสั่งแล้วตอบ ack กลับ ไว้ทดสอบโดยไม่ต้องมีอุปกรณ์จริง

## รูปแบบ MQTT topic (เพิ่มจาก Phase 2)
```
devices/{device_id}/command   <-- backend publish คำสั่งมาที่นี่ ({ command_id, action })
devices/{device_id}/ack       <-- อุปกรณ์ publish ผลลัพธ์กลับมาที่นี่ ({ command_id, status })
```

`status` ใน ack ต้องเป็น `"success"` หรือ `"failed"` เท่านั้น

## ขั้นตอนการทดสอบ

1. รัน dependencies/migration ใหม่ (ไม่มี migration ใหม่ใน phase นี้ แต่เผื่อพลาด):
   ```bash
   npm install
   ```

2. Restart backend:
   ```bash
   npm run start:dev
   ```
   ควรเห็น log: `subscribe "devices/+/telemetry" และ "devices/+/ack" สำเร็จ`

3. สร้างอุปกรณ์ประเภท actuator (หรือใช้ device เดิมก็ได้เพื่อทดสอบ):
   ```powershell
   $body = @{ name = "ปลั๊กไฟห้องนอน"; type = "actuator"; location = "bedroom" } | ConvertTo-Json
   Invoke-RestMethod -Uri "http://localhost:3000/devices" -Method Post -ContentType "application/json" -Body $body
   ```
   จด `id` ที่ได้ไว้

4. เปิด terminal ใหม่ รัน simulator จำลองอุปกรณ์ไฟฟ้า (ปล่อยรันค้างไว้):
   ```bash
   node scripts/simulate-actuator.js <device_id>
   ```

5. เปิด terminal อีกอันสั่งงานอุปกรณ์:
   ```powershell
   $body = @{ action = "turn_on" } | ConvertTo-Json
   Invoke-RestMethod -Uri "http://localhost:3000/devices/<device_id>/commands" -Method Post -ContentType "application/json" -Body $body
   ```
   จะได้ `command` กลับมาพร้อม `id` และ `status: "pending"`

6. รอ ~1 วินาที แล้วเช็คสถานะคำสั่ง (แทนที่ `<command_id>` ด้วย id ที่ได้จากข้อ 5):
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:3000/devices/<device_id>/commands/<command_id>" -Method Get
   ```
   ควรเห็น `status: "success"` แล้ว (เพราะ simulator ตอบ ack กลับให้)

7. **ทดสอบ timeout**: ปิด simulator (`Ctrl+C`) แล้วสั่งงานอุปกรณ์ใหม่อีกครั้ง (ข้อ 5) รอเกิน `COMMAND_TIMEOUT_MS` (default 10 วินาที) แล้วเช็คสถานะคำสั่ง (ข้อ 6) — ควรเปลี่ยนเป็น `timeout`

8. ดูประวัติคำสั่งทั้งหมดของอุปกรณ์:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:3000/devices/<device_id>/commands" -Method Get
   ```

## Deliverable ของ Phase 3 (เช็คให้ผ่านก่อนไป Phase 4)
- [ ] Backend log แสดงว่า subscribe ทั้ง telemetry และ ack topic สำเร็จ
- [ ] สั่งงานผ่าน `POST /commands` แล้วได้ command กลับมาพร้อมสถานะ `pending`
- [ ] เมื่อ simulator ตอบ ack กลับ สถานะเปลี่ยนเป็น `success` ถูกต้อง
- [ ] ปิด simulator แล้วสั่งงานใหม่ รอเกิน timeout แล้วสถานะเปลี่ยนเป็น `timeout` เองโดยไม่ต้อง restart backend
- [ ] ส่ง ack ซ้ำสำหรับคำสั่งเดียวกัน ระบบไม่ error และไม่เปลี่ยนสถานะซ้ำ (ดู log จะเป็น warning "ได้รับ ack ซ้ำ")

---

# Phase 4: Rule Engine & Automation

เพิ่มระบบตั้งเงื่อนไขอัตโนมัติ เช่น "ถ้าอุณหภูมิ > 30 ให้เปิดพัดลม" — ทำงานทุกครั้งที่มี telemetry ใหม่เข้ามา ไม่ต้องรอ polling

## สิ่งที่เพิ่มเข้ามา
- ตาราง **`rules`** — เก็บเงื่อนไข (เซนเซอร์ตัวไหน, operator, threshold, อุปกรณ์เป้าหมาย, action, cooldown)
- ตาราง **`rule_execution_logs`** — log ทุกครั้งที่ rule เงื่อนไขตรง (ไม่ว่าจะสั่งงานสำเร็จ หรือติด cooldown หรือ error)
- **`RulesService.evaluateForSensor()`** — ถูกเรียกจาก `IngestionService` ทันทีหลังบันทึก telemetry แต่ละครั้ง เช็คทุก rule ที่ผูกกับเซนเซอร์นั้น
- **Cooldown** — ป้องกันการสั่งงานถี่เกินไป (เช่น เซนเซอร์ส่งข้อมูลทุก 5 วินาที แต่ตั้ง cooldown 60 วินาที ก็จะสั่งซ้ำได้ทุก 60 วินาทีเท่านั้น)
- CRUD API เต็มรูปแบบสำหรับจัดการ rule

## Endpoint ใหม่
```
POST   /rules              สร้าง rule ใหม่
GET    /rules               ดู rule ทั้งหมด
GET    /rules/:id           ดู rule ตัวเดียว
PATCH  /rules/:id           แก้ไข rule (รวมถึงเปิด/ปิดด้วย enabled: false)
DELETE /rules/:id           ลบ rule
GET    /rules/:id/logs      ดูประวัติการทำงานของ rule
```

## Operator ที่รองรับ
`>`, `<`, `>=`, `<=`, `==`, `!=`

## ขั้นตอนการทดสอบ

1. รัน migration ใหม่:
   ```bash
   npm run migration:run
   ```

2. Restart backend:
   ```bash
   npm run start:dev
   ```

3. เตรียมอุปกรณ์ 2 ตัว (ใช้ตัวเดิมจาก phase ก่อนได้เลย): เซนเซอร์อุณหภูมิ (`SENSOR_ID`) และปลั๊กไฟ/พัดลม (`ACTUATOR_ID`)

4. สร้าง rule: "ถ้าอุณหภูมิ > 25 ให้เปิดพัดลม" cooldown 20 วินาที (สั้นๆ เพื่อทดสอบง่าย):
   ```powershell
   $body = @{
       name = "เปิดพัดลมเมื่อร้อน"
       sensor_device_id = "<SENSOR_ID>"
       operator = ">"
       threshold = 25
       target_device_id = "<ACTUATOR_ID>"
       action = "turn_on"
       cooldown_seconds = 20
   } | ConvertTo-Json
   Invoke-RestMethod -Uri "http://localhost:3000/rules" -Method Post -ContentType "application/json" -Body $body
   ```
   จด `id` ของ rule ที่ได้ไว้

5. เปิด simulator จำลองอุปกรณ์ไฟฟ้า (รับคำสั่งแล้วตอบ ack):
   ```bash
   node scripts/simulate-actuator.js <ACTUATOR_ID>
   ```

6. เปิด terminal ใหม่ รัน simulator จำลองเซนเซอร์ส่งค่าสูงกว่า threshold:
   ```bash
   node scripts/simulate-sensor.js <SENSOR_ID>
   ```
   (simulator สุ่มค่า 20-30 องศา ดังนั้นบางรอบจะเกิน 25 บางรอบไม่เกิน — ปกติ)

7. ดู log backend — เมื่อค่าที่สุ่มได้เกิน 25 ควรเห็น:
   ```
   [RulesService] rule ... ทำงาน: ค่า 27.xx > 25 -> สั่ง "turn_on" ไปที่ device ...
   ```
   และฝั่ง simulator actuator ควรเห็น "ได้รับคำสั่ง"

8. เช็คว่า cooldown ทำงานจริง: ภายใน 20 วินาทีถัดมา แม้ค่าจะเกิน 25 อีก ก็ไม่ควรสั่งซ้ำ (เช็คได้จาก log ฝั่ง actuator ว่าไม่มีคำสั่งใหม่เข้ามาถี่กว่า 20 วินาที)

9. ดูประวัติการทำงานของ rule ทั้งหมด (รวมรอบที่ติด cooldown):
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:3000/rules/<rule_id>/logs" -Method Get
   ```
   ควรเห็นบาง entry มี `command_id` (สั่งงานจริง) และบาง entry มี `skipped_reason: "cooldown"`

10. ทดสอบปิด rule ชั่วคราว:
    ```powershell
    $body = @{ enabled = $false } | ConvertTo-Json
    Invoke-RestMethod -Uri "http://localhost:3000/rules/<rule_id>" -Method Patch -ContentType "application/json" -Body $body
    ```
    หลังจากนี้แม้ค่าจะเกิน threshold ก็จะไม่ถูกประมวลผลอีก (เพราะ query กรอง `enabled: true`)

## Deliverable ของ Phase 4
- [ ] สร้าง rule ผ่าน `POST /rules` สำเร็จ
- [ ] เมื่อค่าจากเซนเซอร์ตรงเงื่อนไข ระบบสั่งงานอุปกรณ์เป้าหมายจริงโดยอัตโนมัติ (เห็น log และ actuator ได้รับคำสั่ง)
- [ ] Cooldown ทำงานถูกต้อง ไม่สั่งงานถี่กว่าที่ตั้งไว้
- [ ] `GET /rules/:id/logs` แสดงประวัติครบทั้งรอบที่สั่งงานจริงและรอบที่ติด cooldown
- [ ] ปิด rule ด้วย `enabled: false` แล้วระบบหยุดประมวลผล rule นั้นทันที

---

# Phase 5: Camera Integration

เพิ่มความสามารถดูภาพสดจากกล้อง IP ผ่าน MediaMTX (แปลง RTSP เป็น HLS/WebRTC ให้เปิดดูผ่านเว็บได้) พร้อมบันทึกคลิปอัตโนมัติขึ้น MinIO

> **หมายเหตุสำคัญ:** ไม่มีกล้อง IP จริงให้ทดสอบตอนพัฒนา ระบบนี้จึงถูกออกแบบให้ทดสอบได้ 2 ส่วนแยกกัน — (1) การเชื่อมต่อกล้องจริงผ่าน MediaMTX ซึ่งต้องมีกล้อง RTSP จริงหรือ ffmpeg จำลอง และ (2) pipeline อัปโหลดคลิปขึ้น MinIO ซึ่งทดสอบได้ทันทีด้วย simulator โดยไม่ต้องมีกล้องเลย
>
> ชื่อ config key บางตัวใน `mediamtx.yml` (เช่น `recordSegmentDuration`, `recordFormat`) อาจเปลี่ยนไปตามเวอร์ชันของ MediaMTX ที่ดึงมา ถ้า config ไม่ทำงานตามคาด ให้เทียบกับตัวอย่าง `mediamtx.yml` ล่าสุดที่ https://github.com/bluenviron/mediamtx

## สิ่งที่เพิ่มเข้ามา
- **`devices.rtsp_url`** — column ใหม่เก็บ RTSP source ของกล้องแต่ละตัว
- **`CamerasService`** — เรียก MediaMTX control API (`/v3/config/paths/add/:id`) แบบ dynamic เพื่อสั่งให้ MediaMTX ไปดึงสตรีมจากกล้องตัวนั้น (แบบ `sourceOnDemand` คือดึงเฉพาะตอนมีคนดู ประหยัด bandwidth กล้อง) พร้อมตั้งให้บันทึกคลิปอัตโนมัติ
- **`RecordingsService`** — สแกนโฟลเดอร์ `recordings/` ทุก 15 วินาที (`@Interval`) หาไฟล์คลิปใหม่ที่ MediaMTX เขียนไว้ อัปโหลดขึ้น MinIO แล้วบันทึก metadata ลงตาราง `camera_recordings`
- ตาราง **`camera_recordings`** — เก็บ object key ใน MinIO, ขนาดไฟล์, เวลาบันทึก
- **`scripts/simulate-camera-clip.js`** — จำลองว่ามีคลิปใหม่เกิดขึ้น ไว้ทดสอบ pipeline อัปโหลดโดยไม่ต้องมีกล้องจริง

## Endpoint ใหม่
```
PUT  /devices/:deviceId/camera             ตั้ง/แก้ไข RTSP source ของกล้อง { "rtsp_url": "rtsp://..." }
GET  /devices/:deviceId/camera/stream      ดู URL สำหรับเปิดสตรีมสด (HLS/WebRTC)
GET  /devices/:deviceId/camera/recordings  ดูรายการคลิปที่บันทึกไว้ พร้อม presigned download URL
```

## ขั้นตอนการทดสอบ

### 1. เปิด infra ใหม่ (มี MediaMTX และ MinIO เพิ่ม)
```bash
docker compose up -d mediamtx minio
```

### 2. รัน migration และ dependency
```bash
npm install
npm run migration:run
```

### 3. Restart backend
```bash
npm run start:dev
```
ควรเห็น log: `สร้าง MinIO bucket "camera-recordings" สำเร็จ` (หรือ "เชื่อมต่อ...สำเร็จ" ถ้าเคยสร้างไว้แล้ว)

### 4. สร้างอุปกรณ์ประเภทกล้อง
```powershell
$body = @{ name = "กล้องหน้าบ้าน"; type = "camera"; location = "front_door" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/devices" -Method Post -ContentType "application/json" -Body $body
```
จด `id` ไว้เป็น `CAMERA_ID`

### 5. ทดสอบ pipeline อัปโหลดคลิป (ไม่ต้องมีกล้องจริง)
```bash
node scripts/simulate-camera-clip.js <CAMERA_ID>
```
รอ ~15-20 วินาที (รอบ scan ของ `RecordingsService`) แล้วเช็ค:
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/devices/<CAMERA_ID>/camera/recordings" -Method Get
```
ควรเห็นรายการคลิปพร้อม `download_url` — เปิดลิงก์นั้นใน browser จะดาวน์โหลดไฟล์ dummy ที่ simulator สร้างไว้ได้ (ยืนยันว่า MinIO เก็บและคืนไฟล์ได้จริง)

### 6. ทดสอบกับกล้องจริง (ถ้ามี) หรือจำลองด้วย ffmpeg
ถ้ามีกล้อง IP จริงที่รองรับ RTSP (เช่น `rtsp://user:pass@192.168.1.50:554/stream1`):
```powershell
$body = @{ rtsp_url = "rtsp://user:pass@192.168.1.50:554/stream1" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/devices/<CAMERA_ID>/camera" -Method Put -ContentType "application/json" -Body $body
```

ถ้ายังไม่มีกล้องจริงแต่มี `ffmpeg` ติดตั้งไว้ ใช้คำสั่งนี้จำลองกล้อง publish วิดีโอทดสอบเข้า MediaMTX โดยตรง (ไม่ผ่าน backend เพราะ MediaMTX รับ publish เข้ามาตรงๆ ได้เลยถ้าตั้ง path ไว้):
```bash
ffmpeg -re -f lavfi -i testsrc=size=640x480:rate=15 -c:v libx264 -f rtsp -rtsp_transport tcp rtsp://localhost:8554/<CAMERA_ID>
```

### 7. ดู URL สำหรับเปิดสตรีม
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/devices/<CAMERA_ID>/camera/stream" -Method Get
```
จะได้ `hls_url` และ `webrtc_url` — เปิด `hls_url` ผ่าน VLC (Media > Open Network Stream) หรือฝัง `<video>` + hls.js ในหน้าเว็บเพื่อดูภาพสด

## Deliverable ของ Phase 5
- [ ] `docker compose up -d mediamtx minio` รันสำเร็จ ไม่ error
- [ ] Backend log ยืนยันเชื่อมต่อ MinIO bucket สำเร็จ
- [ ] รัน `simulate-camera-clip.js` แล้วคลิปถูกอัปโหลดขึ้น MinIO และดึงผ่าน `GET /camera/recordings` ได้ พร้อม `download_url` ที่เปิดได้จริง
- [ ] `PUT /devices/:id/camera` ตั้ง RTSP source สำเร็จ (ถ้ามีกล้องจริงหรือ ffmpeg ทดสอบ: เปิด `hls_url` แล้วเห็นภาพจริง)

---

# Phase 6: Auth & API Gateway

เพิ่มระบบล็อกอินด้วย JWT และจำกัดสิทธิ์ตาม role — **เป็น breaking change**: จากนี้ไปทุก endpoint (ยกเว้น `/health` และ `/auth/*`) ต้องแนบ `Authorization: Bearer <access_token>` มาด้วยเสมอ ไม่งั้นได้ `401 Unauthorized`

## สิ่งที่เพิ่มเข้ามา
- **JWT access token** (อายุสั้น default 15 นาที) + **refresh token** (อายุยาว default 7 วัน เก็บเป็น SHA-256 hash ใน DB เท่านั้น ไม่เก็บ token จริง)
- **Refresh token rotation** — ทุกครั้งที่ใช้ refresh token จะถูก revoke ทันทีและออกชุดใหม่ให้ ป้องกันการเอา token เก่าที่หลุดไปใช้ซ้ำได้เรื่อยๆ
- **Role-based access** — 2 role: `admin`, `user`. **ผู้ใช้คนแรกที่สมัครในระบบจะกลายเป็น admin อัตโนมัติ** (bootstrap) คนถัดไปเป็น `user` ธรรมดา
- **Global guard 3 ชั้น** (เรียงตามลำดับ): rate limit → ตรวจ JWT → ตรวจ role
- **Rate limiting**: ทั้งระบบ 100 request/นาที/IP, เฉพาะ `/auth/login` เข้มกว่า 5 ครั้ง/นาที/IP กัน brute-force รหัสผ่าน
- Endpoint ที่ตอนนี้ต้องเป็น **admin** เท่านั้น: `POST /devices` (เพิ่มอุปกรณ์ใหม่), ทุก endpoint ใน `/users`
- endpoint อื่นทั้งหมด (telemetry, commands, rules, camera) แค่ต้อง **login แล้ว** (role ไหนก็ได้)

## Endpoint ใหม่
```
POST /auth/register    สมัครสมาชิก { email, password } (คนแรกกลายเป็น admin)
POST /auth/login       ล็อกอิน { email, password } -> ได้ access_token + refresh_token
POST /auth/refresh     ขอ token ชุดใหม่ { refresh_token } (แบบ rotate)
POST /auth/logout      ออกจากระบบ { refresh_token } (revoke token นั้น)
GET  /auth/me          ดูข้อมูลตัวเอง (ต้องล็อกอิน)
GET  /users            ดูผู้ใช้ทั้งหมด (admin เท่านั้น)
PATCH /users/:id/role  เปลี่ยน role ผู้ใช้ (admin เท่านั้น)
```

## ขั้นตอนการทดสอบ

### 1. ติดตั้ง dependency ใหม่ (bcrypt เป็น native module)
```bash
npm install
```
> ถ้า `npm install` ค้างหรือ error ตรง `bcrypt` (ปกติมักไม่เกิดเพราะมี prebuilt binary ให้ Windows แล้ว) ให้บอกผม จะเปลี่ยนไปใช้ `bcryptjs` (pure JS ไม่ต้อง compile) แทนให้

### 2. รัน migration
```bash
npm run migration:run
```

### 3. Restart backend
```bash
npm run start:dev
```

### 4. ทดสอบว่า endpoint เดิมโดนล็อกแล้วจริง
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/devices" -Method Get
```
ควรได้ `401 Unauthorized` ทันที (ก่อนหน้านี้ endpoint นี้เรียกได้เลย ตอนนี้ต้องล็อกอินก่อน)

### 5. สมัครสมาชิกคนแรก (จะกลายเป็น admin อัตโนมัติ)
```powershell
$body = @{ email = "admin@example.com"; password = "SuperSecret123" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/auth/register" -Method Post -ContentType "application/json" -Body $body
```

### 6. ล็อกอินเพื่อขอ token
```powershell
$body = @{ email = "admin@example.com"; password = "SuperSecret123" } | ConvertTo-Json
$tokens = Invoke-RestMethod -Uri "http://localhost:3000/auth/login" -Method Post -ContentType "application/json" -Body $body
$tokens
```
เก็บ `access_token` ไว้ในตัวแปรเพื่อใช้ต่อ:
```powershell
$accessToken = $tokens.access_token
$headers = @{ Authorization = "Bearer $accessToken" }
```

### 7. เรียก endpoint เดิมอีกครั้ง พร้อมแนบ token
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/devices" -Method Get -Headers $headers
```
ควรผ่านแล้ว (เห็นรายการอุปกรณ์ตามปกติ)

### 8. ทดสอบ role-based access — สมัคร user ธรรมดาอีกคน
```powershell
$body2 = @{ email = "user1@example.com"; password = "SomePassword123" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/auth/register" -Method Post -ContentType "application/json" -Body $body2

$login2 = @{ email = "user1@example.com"; password = "SomePassword123" } | ConvertTo-Json
$tokens2 = Invoke-RestMethod -Uri "http://localhost:3000/auth/login" -Method Post -ContentType "application/json" -Body $login2
$headers2 = @{ Authorization = "Bearer $($tokens2.access_token)" }
```
ลองสร้างอุปกรณ์ด้วย token ของ user ธรรมดา (ต้องโดนบล็อกเพราะ `POST /devices` เป็น admin เท่านั้น):
```powershell
$deviceBody = @{ name = "ทดสอบ"; type = "sensor" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/devices" -Method Post -ContentType "application/json" -Body $deviceBody -Headers $headers2
```
ควรได้ `403 Forbidden` (ลองสลับไปใช้ `$headers` ของ admin ดูจะสำเร็จแทน)

### 9. ทดสอบ refresh token
```powershell
$refreshBody = @{ refresh_token = $tokens.refresh_token } | ConvertTo-Json
$newTokens = Invoke-RestMethod -Uri "http://localhost:3000/auth/refresh" -Method Post -ContentType "application/json" -Body $refreshBody
$newTokens
```
ได้ token ชุดใหม่ ลองเอา `refresh_token` **ชุดเดิม** (ตัวแรก) มาเรียกซ้ำอีกครั้ง — ควรโดนปฏิเสธ (`401`) เพราะถูก revoke ไปแล้วตอน rotate

### 10. ทดสอบ logout
```powershell
$logoutBody = @{ refresh_token = $newTokens.refresh_token } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/auth/logout" -Method Post -ContentType "application/json" -Body $logoutBody
```

## Deliverable ของ Phase 6
- [ ] เรียก endpoint เดิม (เช่น `GET /devices`) โดยไม่แนบ token แล้วได้ `401`
- [ ] สมัครสมาชิกคนแรกสำเร็จและกลายเป็น `admin` โดยอัตโนมัติ
- [ ] ล็อกอินได้ token แล้วเรียก endpoint เดิมผ่านได้ปกติ
- [ ] user ธรรมดาเรียก `POST /devices` แล้วโดน `403 Forbidden` แต่ admin เรียกผ่าน
- [ ] refresh token ใช้ครั้งเดียวจริง (rotate) — ใช้ตัวเก่าซ้ำแล้วโดนปฏิเสธ
- [ ] login ผิดรหัสผ่านติดกันเกิน 5 ครั้งใน 1 นาทีแล้วโดน rate limit บล็อกชั่วคราว

---

# Phase 7: Dashboard & Notification

เพิ่ม WebSocket ส่งสถานะอุปกรณ์/telemetry/คำสั่ง/rule แบบ real-time ให้ dashboard ไม่ต้อง polling API รัวๆ พร้อมระบบแจ้งเตือนผ่าน Telegram เมื่อมี event สำคัญ

## สิ่งที่เพิ่มเข้ามา
- **`RealtimeGateway`** — WebSocket (Socket.io) endpoint ที่ backend เดียวกัน (port 3000) ตรวจ JWT ตอน connect เหมือน REST API ทุกประการ ไม่มี token ต่อไม่ติด
- Event ที่ broadcast ออกไปอัตโนมัติ:
  - `device:status` — อุปกรณ์เปลี่ยนเป็น online/offline
  - `telemetry` — มีข้อมูลเซนเซอร์ใหม่เข้ามา (ต้อง subscribe device นั้นก่อนถึงจะได้รับ)
  - `command:status` — คำสั่งเปลี่ยนสถานะ (success/failed/timeout)
  - `rule:triggered` — rule ทำงานและสั่งอุปกรณ์จริง
- **`NotificationsService`** + **`TelegramService`** — ส่งข้อความแจ้งเตือนผ่าน Telegram Bot เมื่ออุปกรณ์ offline หรือ command timeout หรือ rule ทำงาน พร้อมเก็บ log ทุกครั้งลงตาราง `notification_logs` (ไม่ว่าจะส่งสำเร็จ ล้มเหลว หรือข้ามเพราะยังไม่ได้ตั้งค่า)
- **`GET /notifications`** — ดูประวัติการแจ้งเตือนย้อนหลัง
- **`dashboard-test.html`** — หน้าเว็บทดสอบสำเร็จรูป เปิดในเบราว์เซอร์ได้เลยไม่ต้อง build อะไร มี 2 ส่วน:
  - แท็บ **🔌 Realtime**: เชื่อมต่อ WebSocket แสดง event แบบ real-time (ของเดิม)
  - แท็บ **🔑 Auth, 👤 Users, 📟 Devices, 📊 Telemetry, 🎮 Commands, ⚙️ Rules, 📷 Camera, 🔔 Notifications, ❤️ Health**: ฟอร์มทดสอบ REST API ทุกตัวที่สร้างมาตั้งแต่ Phase 1-7 ครบ ไม่ต้องเปิด PowerShell พิมพ์ `Invoke-RestMethod` เองอีกต่อไป — login ในแท็บ Auth ครั้งเดียว token จะถูกเติมให้อัตโนมัติทั้งฝั่ง API และ WebSocket

## ขั้นตอนการทดสอบ

### 1. ติดตั้ง dependency ใหม่ (socket.io)
```bash
npm install
```

### 2. รัน migration
```bash
npm run migration:run
```

### 3. (ไม่บังคับ) ตั้งค่า Telegram แจ้งเตือน
ถ้าไม่ตั้งค่า ระบบจะยัง log เหตุการณ์ลง `notification_logs` ปกติ แค่ไม่ส่งข้อความจริง (status: `skipped`)

เปิด Telegram คุยกับ **@BotFather** พิมพ์ `/newbot` ทำตามขั้นตอนจะได้ `TELEGRAM_BOT_TOKEN` จากนั้นส่งข้อความอะไรก็ได้คุยกับบอทที่สร้าง 1 ครั้ง แล้วเปิด URL นี้ในเบราว์เซอร์ (แทน `<TOKEN>` ด้วยค่าจริง) เพื่อหา `chat.id`:
```
https://api.telegram.org/bot<TOKEN>/getUpdates
```
ใส่ค่าที่ได้ลงใน `.env`:
```env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_CHAT_ID=123456789
```

### 4. Restart backend
```bash
npm run start:dev
```

### 5. เปิดหน้าทดสอบ dashboard
เปิดไฟล์ `dashboard-test.html` ด้วยเบราว์เซอร์ (ดับเบิลคลิกได้เลย ไม่ต้องรันเซิร์ฟเวอร์)

1. ล็อกอินผ่าน API ก่อนเพื่อเอา `access_token` (ใช้คำสั่งจาก Phase 6):
   ```powershell
   $tokens = Invoke-RestMethod -Uri "http://localhost:3000/auth/login" -Method Post -ContentType "application/json" -Body $body
   $tokens.access_token
   ```
2. คัดลอก token มาวางในช่อง **Access Token** บนหน้าเว็บ
3. กด **เชื่อมต่อ** ควรเห็นสถานะเปลี่ยนเป็นสีเขียว "เชื่อมต่อสำเร็จ"
4. ใส่ `device_id` ของเซนเซอร์ (เช่นตัวที่ใช้มาตลอด) ในช่อง subscribe แล้วกด **Subscribe**

### 6. ทดสอบว่า event เข้ามาจริง
เปิด terminal อีกอันรัน simulator เดิมจาก Phase 2:
```bash
node scripts/simulate-sensor.js <SENSOR_ID>
```
กลับไปดูหน้าเว็บ — ควรเห็น event `TELEMETRY` ขึ้นเรื่อยๆ ใน log แบบ real-time ทันทีที่มีข้อมูลเข้า ไม่ต้อง refresh หน้า

ลองรัน simulator actuator + สั่งงานจาก Phase 3 หรือกระตุ้น rule จาก Phase 4 ดูด้วยก็ได้ ควรเห็น event `COMMAND` และ `RULE` ขึ้นตามลำดับเช่นกัน

### 7. ทดสอบ device offline notification
หยุด simulator เซนเซอร์ (`Ctrl+C`) รอเกิน `DEVICE_OFFLINE_THRESHOLD_SECONDS` (default 30s) — ควรเห็น:
- หน้าเว็บ: event `STATUS` บอกว่าอุปกรณ์เป็น offline
- ถ้าตั้งค่า Telegram ไว้: ได้ข้อความแจ้งเตือนจริงในแชท
- เช็ค log การแจ้งเตือนทั้งหมด (ต้องแนบ token):
  ```powershell
  Invoke-RestMethod -Uri "http://localhost:3000/notifications" -Method Get -Headers $headers
  ```

## Deliverable ของ Phase 7
- [ ] เปิด `dashboard-test.html` เชื่อมต่อ WebSocket ด้วย token สำเร็จ (ไม่มี token หรือ token ผิดต้องต่อไม่ติด)
- [ ] รัน sensor simulator แล้วเห็น event `telemetry` ขึ้นบนหน้าเว็บแบบ real-time
- [ ] อุปกรณ์ offline แล้วเห็น event `device:status` และถ้าตั้ง Telegram ไว้ต้องได้ข้อความจริง
- [ ] `GET /notifications` แสดงประวัติการแจ้งเตือนครบ ไม่ว่าจะ sent/failed/skipped
- [ ] Rule ทำงานแล้วเห็น event `rule:triggered` บนหน้าเว็บด้วย
