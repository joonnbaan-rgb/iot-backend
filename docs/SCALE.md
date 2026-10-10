# เฟส H: รองรับอุปกรณ์จำนวนมาก (ingestion, Timescale, monitoring, load test)

## ภาพรวมท่อรับข้อมูล

```
อุปกรณ์ ──MQTT──> EMQX ──> backend (MqttService)
                              │  INGEST_MODE=stream
                              ▼
                      Redis Stream  iot:telemetry   (XADD อย่างเดียว เร็ว)
                              │  consumer group "ingest"
                              ▼
                      IngestWorker (อ่านทีละ ≤ 500 รายการ)
                        1) UPDATE devices  (สถานะ online / last_seen)   ← 1 query ต่อ batch
                        2) INSERT sensor_data (unnest)                   ← 1 query ต่อ batch
                        3) ส่ง realtime ให้เว็บ/แอป
                        4) ตรวจ rule (ค่าล่าสุดต่ออุปกรณ์ใน batch)
                        5) XACK
```

เดิม: 1 message = ~3 query (หา device, INSERT, UPDATE device) ตอนนี้: 1 batch (หลายร้อย message) = 2 query

| ค่า (env) | ความหมาย | ค่าเริ่มต้น |
|---|---|---|
| `INGEST_MODE` | `direct` ประมวลผลทันทีเหมือนเดิม / `stream` ใช้คิว Redis | `direct` (dev), `stream` (docker-compose.prod) |
| `INGEST_BATCH_SIZE` | จำนวนสูงสุดต่อ batch | 500 |
| `INGEST_STREAM_MAXLEN` | ความยาวคิวสูงสุด (เกินแล้วตัดของเก่า) | 200000 |
| `INGEST_WORKER` | `false` = instance นี้ส่งเข้าคิวอย่างเดียว ไม่ประมวลผล | `true` |

พฤติกรรมที่ควรรู้
- **Redis ล่ม** → ระบบ fallback เป็นเขียนตรงทีละ message อัตโนมัติ (ไม่ทิ้งข้อมูล แต่ช้าลง) ดูตัวนับ `iot_ingest_enqueued_total{result="fallback_direct"}`
- **DB ล่ม** → message ไม่ถูก ACK, worker retry พร้อม backoff (สูงสุด 5 วินาที) เมื่อ DB กลับมาจะประมวลผลต่อ
- **worker ตายกลางทาง** → message ที่ค้างจะถูก `XAUTOCLAIM` กลับมาทำใหม่หลังค้างเกิน 60 วินาที
- **ข้อมูลผิดจริง** (DB ปฏิเสธ) → ย้ายไป stream `iot:telemetry:dead` (เก็บ 1000 รายการล่าสุด) ไม่วนซ้ำ
- รับประกันแบบ *at-least-once* แต่เขียน DB แบบ idempotent: id ของแถวสร้างจาก stream entry id + `ON CONFLICT DO NOTHING` จึงอ่านซ้ำ/retry แล้วไม่เกิดแถวซ้ำ
- payload ที่ไม่ผ่านการตรวจ (เช่น `recorded_at` อ่านไม่ได้) จะถูกย้ายไป dead-letter และนับใน `iot_ingest_processed_total{result="invalid"}`
- เปิดโหมด stream แล้ว ค่า `last_seen_at` ถูกเขียนไม่ถี่เกิน 5 วินาทีต่ออุปกรณ์ (ลดโหลดเขียน)
- ตรวจ rule จากค่าล่าสุดของแต่ละอุปกรณ์ใน batch (ไม่ใช่ทุกค่า) — เมื่ออุปกรณ์ส่งถี่กว่ารอบ batch

เปิดใช้ในเครื่อง dev: ใส่ `INGEST_MODE=stream` ใน `.env` แล้ว `docker compose up -d --build backend`

## TimescaleDB (migration `1700001200000-TimescaleOptimize`)

| สิ่งที่ตั้ง | ค่า |
|---|---|
| index | `(device_id, recorded_at DESC)` |
| compression | chunk เก่ากว่า 7 วัน (segment ตาม `device_id`) |
| continuous aggregate | `sensor_data_5m` (ละ 5 นาที), `sensor_data_1h` (รายชั่วโมง) เก็บ sum/min/max/count/last |
| retention | ข้อมูลดิบ 180 วัน, สรุป 5 นาที 365 วัน, สรุปรายชั่วโมงเก็บตลอด |

⚠️ **การลบข้อมูลดิบเก่ากว่า 180 วันเป็นค่าเริ่มต้นที่ผมเลือกเอง** ถ้าต้องการเก็บนานกว่านี้:
```sql
SELECT remove_retention_policy('sensor_data');
SELECT add_retention_policy('sensor_data', INTERVAL '365 days');
```
ช่วง refresh ของสรุปรายชั่วโมงคือ 90 วันย้อนหลัง (ต้องสั้นกว่า retention ของข้อมูลดิบเสมอ ไม่งั้นสรุปเก่าจะถูกคำนวณใหม่จนว่าง)

API ใหม่: `GET /devices/:id/telemetry/summary?from=&to=&bucket=auto|1m|5m|1h` ให้ avg/min/max/n ต่อช่วง
(`auto`: ≤2 ชม. → 1 นาที, ≤2 วัน → 5 นาที, นานกว่านั้น → 1 ชม.) Web Admin ใช้ตัวนี้วาดกราฟ ถ้ายังไม่มี aggregate จะคำนวณจากข้อมูลดิบแทน

### Backfill ข้อมูลเก่า (ทำครั้งเดียวหลังรัน migration)
aggregate ถูกสร้างแบบ `WITH NO DATA` และ policy refresh ย้อนหลังแค่ 30/90 วัน ถ้าฐานข้อมูลมีข้อมูลเก่ากว่านั้นอยู่แล้ว ให้ backfill เอง
(คำสั่ง `CALL` รันใน transaction ไม่ได้ จึงไม่ได้ใส่ใน migration; ช่วงต้องอยู่ภายใน retention ของข้อมูลดิบ 180 วัน):
```powershell
docker compose exec timescaledb psql -U iot -d iot_backend -c "CALL refresh_continuous_aggregate('sensor_data_5m', now() - interval '170 days', now() - interval '5 minutes');"
docker compose exec timescaledb psql -U iot -d iot_backend -c "CALL refresh_continuous_aggregate('sensor_data_1h', now() - interval '170 days', now() - interval '1 hour');"
```
ถ้าไม่ทำ กราฟช่วง 7 วันขึ้นไปจะแสดงเฉพาะช่วงที่ aggregate ครอบคลุม และข้อมูลดิบที่เก่ากว่า 90–180 วันจะถูกลบโดยไม่เคยถูกสรุปเป็นรายชั่วโมง

### ตรวจว่า Timescale ตั้งค่าครบ
migration ห่อแต่ละขั้นไว้ ถ้าเวอร์ชัน Timescale ไม่รองรับขั้นไหนจะ**ข้ามพร้อม WARNING** แทนที่จะล้ม จึงต้องตรวจเอง:
```powershell
docker compose exec timescaledb psql -U iot -d iot_backend -c "SELECT application_name, hypertable_name, config FROM timescaledb_information.jobs ORDER BY job_id;"
docker compose exec timescaledb psql -U iot -d iot_backend -c "SELECT view_name FROM timescaledb_information.continuous_aggregates;"
```
ควรเห็น job ประเภท compression, retention, refresh continuous aggregate และ view ทั้งสอง ถ้าขาด ให้ดู log ตอนรัน migration (`docker compose logs backend | findstr "Phase H"`) แล้วส่งมาให้ผมดู

## Monitoring (Prometheus + Grafana)

- dev: Grafana http://localhost:3001 (admin / admin123) → โฟลเดอร์ **IoT** → *IoT Overview*
- production: `https://monitor.<โดเมน>` ผู้ใช้ `admin` รหัสผ่านอยู่ใน `deploy/.env.prod` (`GRAFANA_ADMIN_PASSWORD`) ต้องมี DNS `monitor.<โดเมน>`
- แดชบอร์ดมีสถานะท่อ (เข้าคิว/ประมวลผล, คิวค้าง, lag, ขนาด/เวลา batch), HTTP, event loop, CPU, RAM
- กฎแจ้งเตือน (`deploy/prometheus/alerts.yml`): backend ล่ม, คิวค้าง > 5000, lag p95 > 10s, มี dead-letter, 5xx > 5%, event loop หน่วง — **ยังไม่ส่งออกไปไหน** (ดูได้ที่ Prometheus > Alerts) ถ้าต้องการส่ง LINE/Telegram ต้องเพิ่ม Alertmanager
- ยังไม่ได้เก็บ metrics ของ Postgres/Redis/EMQX (ต้องเพิ่ม exporter แยก)

## Load test

```powershell
npm run loadtest:mqtt -- --email admin@example.com --password 'รหัสผ่าน' --devices 200 --interval 1000 --duration 60 --metrics http://localhost:3000/metrics
```
สคริปต์สร้างอุปกรณ์ `loadtest-*` ผ่าน API, ส่ง MQTT ตามที่กำหนด, รอระบาย แล้วนับแถวใน DB เทียบกับที่ส่ง
(exit code 2 ถ้าสูญหายเกิน 1%) พร้อมลบอุปกรณ์ทดสอบและข้อมูลของมัน (`--keep` เพื่อเก็บ, `--cleanup` เพื่อลบที่ค้าง)

ขั้นตอนแนะนำ: ทดสอบ `INGEST_MODE=direct` ก่อนเพื่อได้ baseline แล้วเปลี่ยนเป็น `stream` แล้วทดสอบซ้ำที่ภาระเท่ากัน เพิ่ม `--devices` ทีละขั้น (200 → 500 → 1000) ดู lag และ CPU ใน Grafana

ข้อจำกัดของการทดสอบ: ตัวทดสอบรันเครื่องเดียวกับระบบ (ถ้าทดสอบในเครื่อง dev) จึงแย่ง CPU กัน ตัวเลขที่ได้เป็นขอบล่าง ไม่ใช่ความสามารถสูงสุดของเซิร์ฟเวอร์จริง
