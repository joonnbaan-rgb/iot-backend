# คู่มือ build และรันทั้งโปรเจกต์ (Windows / PowerShell)

ทุกคำสั่งรันที่ `C:\Projects\iot-backend` เว้นแต่ระบุ ค่าที่เป็นตัวอย่าง (เช่น IP `192.168.1.17`) ให้แทนด้วยค่าจริงของคุณ **ห้ามพิมพ์วงเล็บ `<>` ตามตัวอย่าง**

## 0) เตรียมเครื่อง (ครั้งเดียว)
```powershell
winget install OpenJS.NodeJS.LTS            # Node 20+
winget install Git.Git
winget install Docker.DockerDesktop         # ต้องเปิด Docker Desktop ให้รันอยู่
winget install EclipseAdoptium.Temurin.17.JDK   # สำหรับ build Android (ต้อง JDK 17 เท่านั้น)
winget install Gyan.FFmpeg                  # ไว้จำลองกล้อง (ไม่บังคับ)
```
ปิดแล้วเปิด PowerShell ใหม่ แล้วเช็ก: `node -v`, `git --version`, `docker --version`

## 1) ดึงโค้ดล่าสุด
```powershell
cd C:\Projects\iot-backend
git pull origin main
```

## 2) Backend + บริการทั้งหมดด้วย Docker (dev)
บริการ: TimescaleDB, Redis, EMQX, MediaMTX, MinIO, backend

```powershell
# 2.1 สร้าง .env (ครั้งแรก) - ใช้ค่าตัวอย่างได้เลย
copy .env.example .env
notepad .env          # ตั้ง JWT_SECRET เป็นสตริงยาวสุ่ม; ใส่ token Telegram/LINE/Resend ถ้าต้องการ

# 2.2 build image ของ backend
docker compose build backend

# 2.3 เริ่มทุกบริการ (เบื้องหลัง)
docker compose up -d

# 2.4 รัน migration ของฐานข้อมูล (ทุกครั้งที่มี migration ใหม่ เช่น หลัง git pull)
docker compose exec backend npm run migration:run

# 2.5 ตรวจสถานะ / ดู log
docker compose ps
docker compose logs -f backend          # Ctrl+C เพื่อออก
```
เช็ก backend: เปิด http://localhost:3000/health (หรือ `Invoke-RestMethod http://localhost:3000/health`)

คำสั่งดูแลที่ใช้บ่อย
```powershell
docker compose restart backend          # รีสตาร์ตเฉพาะ backend
docker compose up -d --build backend    # แก้โค้ด backend แล้ว build + เริ่มใหม่
docker compose stop                     # หยุด (ข้อมูลยังอยู่)
docker compose down                     # ลบ container (ข้อมูลใน volume ยังอยู่)
docker compose down -v                  # ลบทุกอย่างรวมข้อมูล (ระวัง! ฐานข้อมูลหาย)
docker compose exec backend npm run migration:revert   # ย้อน migration ล่าสุด 1 ตัว
```
พอร์ตที่ใช้: 3000 API, 5432 DB, 6379 Redis, 1883 MQTT, 18083 EMQX dashboard, 8554 RTSP, 8888 HLS, 8889 WebRTC, 9997 MediaMTX API, 9000/9001 MinIO

## 3) Backend แบบไม่ใช้ Docker สำหรับตัว backend (ไม่บังคับ)
ใช้เมื่ออยากดีบัก: รันเฉพาะบริการเสริมใน Docker แล้วรัน backend บนเครื่อง โดยใน `.env` ให้เปลี่ยน host เป็น `localhost` (DB_HOST, REDIS_HOST, MQTT_URL, MEDIAMTX_API_URL, MINIO_ENDPOINT)
```powershell
docker compose up -d timescaledb redis emqx mediamtx minio
npm install
npm run migration:run
npm run start:dev          # รันแบบ watch
# หรือ build จริง
npm run build
npm run start:prod
```

## 4) ตัวจำลองอุปกรณ์ (ทดสอบโดยไม่มีของจริง)
```powershell
npm run simulate                 # จำลองเซนเซอร์ส่ง telemetry
npm run simulate:actuator        # จำลองอุปกรณ์ที่รับคำสั่ง (เปิด/ปิด)
npm run simulate:camera-clip     # จำลองคลิปกล้องเข้า MinIO (ดู README Phase 5)
```
(ดูอาร์กิวเมนต์ของแต่ละตัวใน README.md)

## 5) Web Admin (React)
```powershell
cd C:\Projects\iot-backend\web-admin
npm install
copy .env.example .env
notepad .env                     # VITE_API_BASE_URL=http://localhost:3000
```
```powershell
npm run dev                      # โหมดพัฒนา http://localhost:5173 (แก้ .env ต้องรันใหม่)
npm run typecheck                # ตรวจ type อย่างเดียว
npm run build                    # typecheck + build ลง dist\
npm run preview                  # ดูผล build ที่ http://localhost:4173
```
หมายเหตุ: ถ้าเปิดจากเครื่องอื่นใน LAN ให้ตั้ง `VITE_API_BASE_URL=http://<IP เครื่อง>:3000` (แทนด้วย IP จริง) และใช้ `npm run dev -- --host`

## 6) แอปมือถือ (Expo / React Native, Android)
### 6.1 ตั้งค่า IP ของ backend (ฝังตอน build — แก้แล้วต้อง build ใหม่)
```powershell
cd C:\Projects\iot-backend\mobile-app
ipconfig                         # ดู IPv4 ของเครื่อง เช่น 192.168.1.17
@"
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.17:3000
EXPO_PUBLIC_WS_URL=http://192.168.1.17:3000
"@ | Set-Content .env
npm install
```
ห้ามใช้ `localhost` เพราะมือถือจะชี้ไปที่ตัวมือถือเอง (ต้องเป็น IP ของคอม หรือโดเมน https ถ้าอยู่บน cloud)

### 6.2 ทดสอบด่วนด้วย Expo Go (ไม่ต้อง build)
```powershell
npx expo start
```
สแกน QR ด้วยแอป Expo Go (มือถือกับคอมต้องอยู่ Wi-Fi เดียวกัน)

### 6.3 Build APK แบบ local (release)
ต้องมี JDK 17 + Android SDK (ติดตั้ง Android Studio แล้วเปิดให้ดาวน์โหลด SDK)
```powershell
# ตั้ง JAVA_HOME เป็น JDK 17 ที่ติดตั้งจริง (หา path ด้วย: dir "C:\Program Files\Eclipse Adoptium")
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.x-hotspot"   # แก้เลขเวอร์ชันให้ตรง
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
java -version                    # ต้องขึ้น 17.x ถ้าเป็น 25 Gradle จะล้ม

npx expo prebuild --clean        # สร้างโฟลเดอร์ android\ ใหม่จาก app.json
cd android
.\gradlew --stop
.\gradlew clean
.\gradlew assembleRelease
```
ไฟล์ APK: `mobile-app\android\app\build\outputs\apk\release\app-release.apk`
ติดตั้ง: ส่งไฟล์เข้ามือถือ (Drive/LINE/สาย USB) แล้วเปิดติดตั้ง ถอนแอปเก่าก่อนถ้าติดตั้งทับไม่ได้
ถ้าต่อ USB และเปิด USB debugging: `adb install -r app\build\outputs\apk\release\app-release.apk`

### 6.4 Build บน cloud ของ Expo (EAS) — ไม่ต้องมี Android SDK
```powershell
npm install -g eas-cli
eas login
eas build -p android --profile preview      # ได้ APK แจกจ่ายภายใน
```
(ค่า `EXPO_PUBLIC_*` ต้องตั้งผ่าน `eas secret` / `env` ใน eas.json ไม่ใช่ไฟล์ .env ในเครื่อง)

### 6.5 ตรวจ type
```powershell
npm run typecheck
```

## 7) ทดสอบกล้อง
```powershell
# เว็บแคมของคอม
.\scripts\webcam-stream.ps1 -ListDevices
.\scripts\webcam-stream.ps1
# หรือภาพทดสอบสังเคราะห์ (ใส่ id กล้องจริง)
ffmpeg -re -f lavfi -i testsrc=size=640x480:rate=15 -c:v libx264 -pix_fmt yuv420p -g 30 -f rtsp rtsp://localhost:8554/ID_ของกล้อง
```
กล้องจริง: ตั้ง `rtsp_url` ของอุปกรณ์เป็น `rtsp://user:pass@IP:554/stream1`

## 8) Deploy บน cloud (Linux VPS, Docker)
ดูรายละเอียดเต็มที่ `docs/DEPLOY-CLOUD.md` สรุป:
```bash
git clone https://github.com/joonnbaan-rgb/iot-backend.git && cd iot-backend
bash deploy/init.sh example.com you@example.com     # สร้าง deploy/.env.prod (ใส่โดเมนจริง)
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml up -d --build
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml exec backend npm run migration:run
```
อัปเดตภายหลัง:
```bash
git pull
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml up -d --build
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml exec backend npm run migration:run
```
DNS ที่ต้องมี: `api.`, `stream.`, `mqtt.`, `admin.` ชี้ IP เซิร์ฟเวอร์; เปิดพอร์ต 22, 80, 443, 8883, 8554
Web Admin อยู่ที่ `https://admin.<โดเมน>` (ฝัง `VITE_API_BASE_URL` อัตโนมัติจาก API_DOMAIN)
แอปมือถือสำหรับ cloud: ตั้ง `EXPO_PUBLIC_API_BASE_URL=https://api.<โดเมน>` แล้ว build ใหม่ (ข้อ 6)

## 9) CI (GitHub Actions)
ทำงานเองเมื่อ push: build + migration + test ของ backend และ build ของ web-admin ดูผลที่แท็บ Actions ของ repo

## 10) แก้ปัญหาที่เจอบ่อย
| อาการ | วิธีแก้ |
|---|---|
| `Error resolving plugin ... > 25.0.3` ตอน gradlew | ใช้ JDK 17: ตั้ง `JAVA_HOME` ใหม่, `gradlew --stop`, ลองใหม่ |
| `The syntax of the command is incorrect` | วางคำสั่งที่มี `<...>` ตรงๆ ให้แทนด้วยค่าจริง |
| แอปเชื่อมต่อ backend ไม่ได้ | IP ใน mobile `.env` ผิด/เป็น localhost → แก้แล้ว build APK ใหม่; ตรวจ firewall พอร์ต 3000 |
| แก้ `.env` แล้วไม่เปลี่ยน (web-admin/แอป) | ค่าถูกฝังตอน build/start → รัน `npm run dev` ใหม่ หรือ build ใหม่ |
| backend ขึ้น error ตาราง/คอลัมน์ไม่มี | ยังไม่ได้รัน migration (ข้อ 2.4) |
| ภาพกล้องไม่ขึ้น | ffmpeg ต้องยังรันอยู่, id ต้องตรงกับอุปกรณ์, พอร์ต 8554/8888 เปิดอยู่ |
| `docker compose` ต่อ Docker ไม่ได้ | เปิด Docker Desktop และรอจน engine พร้อม |
