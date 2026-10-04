# IoT Backend — Mobile App

แอป React Native (Expo) สำหรับลงทะเบียนบัญชี, ดูและสั่งงานอุปกรณ์ IoT ที่เชื่อมกับ
[iot-backend](../) (NestJS) ตัวเดียวกับที่ใช้ในโปรเจกต์หลัก

## ฟีเจอร์

- **สมัคร/เข้าสู่ระบบ** — `POST /auth/register`, `/auth/login` พร้อม refresh token
  rotation อัตโนมัติ (ต่ออายุ session เบื้องหลังโดยผู้ใช้ไม่ต้อง login ใหม่ จนกว่า
  refresh token จะหมดอายุจริง — ค่า default 7 วัน)
- **รายการอุปกรณ์** พร้อมสถานะออนไลน์/ออฟไลน์ที่อัปเดตแบบ realtime ผ่าน WebSocket
- **เพิ่มอุปกรณ์ใหม่** (เฉพาะบัญชี admin — ผู้ใช้คนแรกที่สมัครในระบบจะได้สิทธิ์นี้อัตโนมัติ)
- **รายละเอียดอุปกรณ์**:
  - เซนเซอร์ (`sensor`) — กราฟค่าล่าสุด อัปเดตสดเมื่อมี telemetry เข้ามาใหม่
  - อุปกรณ์ไฟฟ้า (`actuator`) — ปุ่มเปิด/ปิด + ประวัติคำสั่งที่อัปเดตสถานะสดแบบ realtime
  - กล้อง IP (`camera`) — แสดง URL สำหรับสตรีม HLS/WebRTC
- **การแจ้งเตือน** — ประวัติแจ้งเตือนจาก backend (Telegram) + เหตุการณ์ rule ทำงานแบบสด
- **โปรไฟล์ผู้ใช้** + ออกจากระบบ

## เทคโนโลยี

React Native + Expo (TypeScript) · React Navigation (stack + bottom tabs) ·
axios (พร้อม interceptor ต่ออายุ token อัตโนมัติ) · socket.io-client ·
expo-secure-store (เก็บ token อย่างปลอดภัยใน Keychain/Keystore) ·
react-native-chart-kit (กราฟเซนเซอร์)

## เริ่มต้นใช้งาน

### 1. ติดตั้ง dependency

```bash
cd mobile-app
npm install
```

### 2. ตั้งค่า URL ของ backend

```bash
cp .env.example .env
```

แก้ `.env` ให้ชี้ไปที่ **IP ของเครื่องที่รัน `docker compose up`** (ดู README หลักของ
โปรเจกต์) — **ห้ามใช้ `localhost`** เพราะมือถือ/อีมูเลเตอร์เป็นคนละเครื่อง/เครือข่าย
namespace กับเครื่อง dev:

```
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.50:3000
EXPO_PUBLIC_WS_URL=http://192.168.1.50:3000
```

หา IP เครื่อง backend:
- Windows: `ipconfig` (ดูแถว IPv4 Address)
- macOS/Linux: `ifconfig` หรือ `ip addr`

มือถือ/อีมูเลเตอร์ต้องอยู่ **วง WiFi เดียวกัน** กับเครื่องที่รัน backend ด้วย

### 3. รันแอป

```bash
npx expo start
```

จากนั้นสแกน QR code ด้วยแอป **Expo Go** (iOS/Android) หรือกด `a`/`i` ในเทอร์มินัลเพื่อ
เปิดใน Android emulator / iOS simulator ที่ติดตั้งไว้แล้ว

## โครงสร้างโปรเจกต์

```
mobile-app/
├── App.tsx                      # root: AuthProvider + NavigationContainer
├── src/
│   ├── api/
│   │   ├── client.ts             # axios instance + auto refresh-token interceptor
│   │   ├── endpoints.ts          # ฟังก์ชันเรียก REST API แต่ละตัว (typed)
│   │   └── tokenStorage.ts       # เก็บ/อ่าน token ด้วย expo-secure-store
│   ├── realtime/
│   │   └── socket.ts             # จัดการ Socket.IO connection + event type
│   ├── contexts/
│   │   └── AuthContext.tsx       # state บัญชีผู้ใช้ + login/register/logout
│   ├── navigation/                # React Navigation stacks/tabs
│   ├── screens/                   # หน้าจอแต่ละหน้า
│   ├── components/                # UI component ใช้ร่วมกัน
│   ├── types/api.ts               # type ตรงกับ entity/DTO ฝั่ง backend
│   └── theme.ts                   # สี/spacing กลาง
```

## การเชื่อมต่อ backend (สรุป endpoint ที่ใช้)

| Flow | Endpoint |
|---|---|
| สมัครสมาชิก | `POST /auth/register` |
| เข้าสู่ระบบ | `POST /auth/login` |
| ต่ออายุ session | `POST /auth/refresh` (เรียกอัตโนมัติเมื่อเจอ 401) |
| ออกจากระบบ | `POST /auth/logout` |
| ข้อมูลบัญชีตัวเอง | `GET /auth/me` |
| รายการอุปกรณ์ | `GET /devices` |
| เพิ่มอุปกรณ์ (admin) | `POST /devices` |
| ประวัติเซนเซอร์ | `GET /devices/:id/telemetry` |
| ส่งคำสั่ง/ประวัติคำสั่ง | `POST` `/` `GET /devices/:id/commands` |
| URL สตรีมกล้อง | `GET /devices/:id/camera/stream` |
| การแจ้งเตือน | `GET /notifications` |
| Realtime | Socket.IO ที่ root URL เดียวกับ REST, auth ผ่าน `handshake.auth.token` |

Socket events ที่แอปฟัง: `device:status`, `telemetry` (ต้อง emit `subscribe:device`
ก่อน), `command:status`, `rule:triggered` — ดู `src/realtime/socket.ts` และฝั่ง backend
`src/realtime/realtime.gateway.ts`

## หมายเหตุสิทธิ์ผู้ใช้ (role)

- `user` ทั่วไป: ดูอุปกรณ์, ดูข้อมูลเซนเซอร์, สั่งงานอุปกรณ์, ดูแจ้งเตือนได้ทั้งหมด
- `admin`: ทำได้ทุกอย่างข้างต้น + เพิ่มอุปกรณ์ใหม่เข้าระบบ (ปุ่ม "+ เพิ่มอุปกรณ์" จะซ่อน
  อัตโนมัติถ้า login ด้วยบัญชีที่ไม่ใช่ admin)

## สิ่งที่ยังไม่รวมไว้ในรอบนี้ (ขยายต่อได้)

- การจัดการ automation rules (CRUD) — backend มี endpoint ครบแล้วที่ `/rules`
  แต่ยังไม่มีหน้าจอในแอป
- การดูวิดีโอสตรีมจริงในแอป (ตอนนี้แสดงแค่ URL — ต้องเพิ่ม video player รองรับ
  HLS/WebRTC เช่น `expo-av` หรือ WebView)
- Push notification บนมือถือเอง (ปัจจุบัน backend แจ้งเตือนผ่าน Telegram เท่านั้น)
- หน้าจอจัดการสิทธิ์ผู้ใช้คนอื่น (`PATCH /users/:id/role`, admin only)

## Build เป็น APK สำหรับทดสอบ (ไม่ต้องใช้ Expo Go)

โปรเจกต์ตั้งค่า [EAS Build](https://docs.expo.dev/build/introduction/) ไว้ให้แล้ว
(ดู `eas.json`, profile `preview` จะ build เป็นไฟล์ `.apk` ติดตั้งตรง — ไม่ใช่ `.aab`
ที่ใช้ขึ้น Play Store) วิธีที่ build จริงบนเครื่องโดย **ไม่ต้องติดตั้ง Android Studio/SDK**
เพราะ EAS build บน server ของ Expo ให้

### 1. ตรวจสอบ/แก้ `.env` ให้เป็น IP จริงของ backend ก่อน build

**สำคัญ**: ค่าใน `EXPO_PUBLIC_API_BASE_URL` / `EXPO_PUBLIC_WS_URL` จะถูก "ฝัง" เข้าไป
ในตัว APK ตอน build เลย (ไม่ใช่อ่านจากเครื่องที่รันตอนหลังแบบ `expo start`) ถ้าแก้ IP
backend ทีหลังต้อง build ใหม่เสมอ ดังนั้นก่อน build ให้เปิด `.env` เช็คว่า IP ถูกต้อง
และมือถือที่จะติดตั้ง APK ต้องอยู่วง WiFi เดียวกับเครื่อง backend ตอนทดสอบด้วย

### 2. ติดตั้งและ login EAS CLI (ครั้งแรกครั้งเดียว)

```powershell
cd mobile-app
npx eas-cli login
```

ถ้ายังไม่มีบัญชี Expo ให้สมัครฟรีที่ https://expo.dev/signup ก่อน

### 3. เชื่อมโปรเจกต์กับ EAS (ครั้งแรกครั้งเดียว)

```powershell
npx eas-cli init
```

คำสั่งนี้จะสร้างโปรเจกต์บน expo.dev ให้และเติม `extra.eas.projectId` ใน `app.json`
ให้อัตโนมัติ (ตอบ "y" เมื่อถามว่าจะสร้างโปรเจกต์ใหม่ไหม)

### 4. สั่ง build APK

```powershell
npx eas-cli build --platform android --profile preview
```

ใช้เวลาประมาณ 10-20 นาที (build บน cloud ของ Expo ไม่ใช่เครื่องเรา) เสร็จแล้วจะได้
ลิงก์ดาวน์โหลด `.apk` ในเทอร์มินัล (และดูย้อนหลังได้ที่ https://expo.dev ภายใต้โปรเจกต์นี้)

### 5. ติดตั้งบนมือถือ Android

ดาวน์โหลดไฟล์ `.apk` จากลิงก์ที่ได้ไปไว้ในมือถือ (เช่น ส่งผ่าน LINE ตัวเองหรือ Google
Drive) แล้วเปิดไฟล์เพื่อติดตั้ง — Android จะเตือนว่าเป็นแอปนอก Play Store
("Install unknown app") ให้กด "อนุญาต"/"ติดตั้งแบบนี้" ได้เลยเพราะเป็น build ของเราเอง

> บัญชี Expo ฟรีมีโควตา build จำกัดต่อเดือน (ดูโควตาปัจจุบันได้ที่ expo.dev) ถ้า build
> บ่อย ๆ ระหว่างพัฒนา แนะนำใช้ `npx expo start` + Expo Go ตามปกติ แล้วค่อย build เป็น
> APK ตอนอยากทดสอบบนเครื่องจริงแบบไม่ง้อ Metro server

### iOS

Build เป็น `.ipa` ทำได้เหมือนกัน (`--platform ios`) แต่ต้องมีบัญชี Apple Developer
($99/ปี) และติดตั้งผ่าน TestFlight หรือลงทะเบียน device ไว้ล่วงหน้า — ซับซ้อนกว่า
Android มาก ถ้าแค่ต้องการทดสอบเร็ว ๆ แนะนำใช้ Expo Go บน iOS แทนตามที่อธิบายไว้ด้านบน
