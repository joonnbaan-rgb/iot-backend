# Phase 8: Hardening & Deploy

แพ็กเกจเสริมนี้ **ไม่ใช่โปรเจกต์เต็ม** — เป็นไฟล์ใหม่ + คำแนะนำแก้ไขไฟล์เดิมแบบจุดต่อจุด
ให้คัดลอกโฟลเดอร์นี้ทั้งหมดไปวางที่ `C:\Projects\iot-backend\phase8\` แล้วทำตามขั้นตอนด้านล่าง

## สิ่งที่อยู่ใน Phase 8 นี้

| เรื่อง | สถานะ |
|---|---|
| Metrics endpoint (`/metrics`, Prometheus format) | ✅ สร้างใหม่ |
| Prometheus + Grafana (docker compose) | ✅ สร้างใหม่ |
| TLS ผ่าน nginx reverse proxy (self-signed) | ✅ สร้างใหม่ |
| Backup script (DB + MinIO) | ✅ สร้างใหม่ |
| CI pipeline (GitHub Actions) | ✅ สร้างใหม่ |
| Load testing (k6) | ✅ สร้างใหม่ |
| MQTT mutual TLS (EMQX) | ⛔ ไม่ทำ — ดูหัวข้อ "ขั้นต่อไปที่แนะนำ" |
| Centralized logging (ELK/Loki) | ⛔ ไม่ทำ — ดูหัวข้อ "ขั้นต่อไปที่แนะนำ" |

---

## ขั้นตอนที่ 1 — ติดตั้ง dependency ใหม่

```powershell
cd C:\Projects\iot-backend
npm install prom-client
```

## ขั้นตอนที่ 2 — คัดลอกไฟล์ metrics module

คัดลอกทั้งโฟลเดอร์ `phase8/src/metrics/` ไปไว้ที่ `src/metrics/` ในโปรเจกต์หลัก:

```
src/metrics/
  ├── metrics.module.ts
  ├── metrics.service.ts
  ├── metrics.controller.ts
  └── metrics.interceptor.ts   (ไม่บังคับ — ใช้ถ้าต้องการ metric http_request_duration)
```

## ขั้นตอนที่ 3 — แก้ไข `src/app.module.ts`

เปิดไฟล์ `src/app.module.ts` แล้วเพิ่ม 2 บรรทัดนี้ (ไม่ต้องเขียนไฟล์ใหม่ทั้งหมด):

**1) เพิ่ม import** (วางรวมกับ import อื่น ๆ):
```typescript
import { MetricsModule } from './metrics/metrics.module';
```

**2) เพิ่มใน `imports: []` array** (วางที่ไหนก็ได้ในลิสต์):
```typescript
imports: [
  // ...ของเดิมทั้งหมด...
  MetricsModule,
],
```

ไม่ต้องแก้ไข providers หรือส่วนอื่นใด — `/metrics` เป็น `@Public()` endpoint จึงไม่ติด JwtAuthGuard

(ไม่บังคับ) ถ้าต้องการ metric `iot_http_request_duration_seconds` ด้วย ให้เพิ่มใน `providers: []`:
```typescript
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsInterceptor } from './metrics/metrics.interceptor';
// ...
providers: [
  // ...ของเดิมทั้งหมด...
  { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
],
```

## ขั้นตอนที่ 4 — เพิ่ม service ใน `docker-compose.yml`

เปิดไฟล์ `docker-compose.yml` เดิม แล้วคัดลอก service `prometheus`, `grafana`, `nginx` และ `volumes` จาก
`phase8/docker-compose.addon.yml` ไปวางต่อท้ายของเดิม (ดูคอมเมนต์ในไฟล์นั้นประกอบ)

จากนั้นสร้าง certificate (self-signed, dev only):
```powershell
cd phase8\nginx
.\generate-cert.ps1
cd ..\..
```

แล้วรันคอนเทนเนอร์ใหม่:
```powershell
docker compose up -d prometheus grafana nginx
```

ตรวจสอบ:
- Prometheus UI: http://localhost:9090 → Status > Targets ควรเห็น `iot-backend` เป็น `UP`
- Grafana: http://localhost:3001 (admin / admin123) → เพิ่ม Data Source เป็น Prometheus (URL: `http://prometheus:9090`)
- Backend ผ่าน HTTPS: https://localhost (เบราว์เซอร์จะเตือน self-signed cert — กด Advanced > Proceed)
- REST API ผ่าน nginx: `https://localhost/api/devices` (ต้องมี Authorization header เหมือนเดิม)
- WebSocket ผ่าน nginx: `wss://localhost/socket.io/`

> **หมายเหตุ**: ชื่อ service ชื่อ `backend` จาก docker-compose เดิมไม่ได้ถูกใช้ตรงนี้ เพราะ backend จริงรันบน host
> (`npm run start:dev`) — nginx และ prometheus เข้าถึงผ่าน `host.docker.internal:3000` แทน

## ขั้นตอนที่ 5 — Backup script

```powershell
mkdir C:\Projects\iot-backend\backups -ErrorAction SilentlyContinue
cd C:\Projects\iot-backend
.\phase8\scripts\backup.ps1
```

ก่อนรันครั้งแรก ให้ตรวจสอบชื่อ volume ของ MinIO ด้วยคำสั่ง:
```powershell
docker volume ls | findstr minio
```
ถ้าชื่อไม่ตรงกับ `iot-backend_minio_data` ให้แก้ตัวแปร `$minioVolume` ในไฟล์ `phase8\scripts\backup.ps1`

แนะนำให้ตั้ง Windows Task Scheduler ให้รันสคริปต์นี้ทุกวัน

## ขั้นตอนที่ 6 — CI/CD

คัดลอกโฟลเดอร์ `phase8/.github/` (รวมไฟล์ `workflows/ci.yml`) ไปไว้ที่ root ของ repo
(`C:\Projects\iot-backend\.github\workflows\ci.yml`)

เมื่อ push ขึ้น GitHub แล้ว workflow จะ: install → lint → build → migrate (กับ postgres service ชั่วคราวใน CI) → test → test:e2e
ถ้า `package.json` ยังไม่มี script `lint` / `test` / `test:e2e` ก็ไม่เป็นไร เพราะใช้ `--if-present`

## ขั้นตอนที่ 7 — Load testing

ติดตั้ง k6 (Windows): `winget install k6` หรือ `choco install k6`

```powershell
cd phase8\scripts
k6 run -e BASE_URL=http://localhost:3000 loadtest.js
```

สคริปต์นี้จะ smoke test ด้วย 5 VU ก่อน แล้วค่อย ramp ขึ้นไป 20 VU เพื่อดู p95 latency และ error rate
(ตั้ง threshold ไว้ที่ p95 < 500ms, error rate < 1%)

---

## ขั้นต่อไปที่แนะนำ (ไม่ได้ทำใน Phase 8 นี้)

**MQTT mutual TLS (EMQX)**: ปัจจุบัน EMQX เปิดแบบ plaintext บน port 1883 สำหรับ dev
สำหรับ production ควรเปิด TLS listener (port 8883) ใน `emqx.conf` พร้อม client certificate
และตั้งให้ device ทุกตัวต้องมี cert ที่ sign จาก CA เดียวกันจึงจะเชื่อมต่อได้
อ้างอิง: https://docs.emqx.com/en/emqx/latest/network/overview.html

**Centralized logging**: เนื่องจาก backend รันบน host (ไม่ได้อยู่ใน docker network) ในปัจจุบัน
การต่อ ELK/Loki ตรงไปตรงมาน้อยกว่าถ้า backend รันใน container
แนะนำสำหรับ production: ย้าย backend เข้า container จริง + ติดตั้ง `nestjs-pino` สำหรับ structured JSON log
แล้วส่งเข้า Loki (คู่กับ Grafana ที่มีอยู่แล้วจาก Phase 8 นี้) หรือ ELK stack
