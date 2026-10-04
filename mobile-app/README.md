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

## Build เป็น APK สำหรับทดสอบ

มีสองทาง: **build local ด้วย Android Studio** (ไม่ต้องมีบัญชี Expo/คลาวด์ ฟรี 100%
แต่ต้องติดตั้ง Android Studio ก่อนครั้งแรก) หรือ **EAS Build** (build บน cloud ของ
Expo ไม่ต้องลง Android Studio แต่ต้องสมัครบัญชี Expo ฟรี — ดูหัวข้อถัดไป)

**สำคัญก่อน build ทั้งสองทาง**: ค่าใน `.env` (`EXPO_PUBLIC_API_BASE_URL` /
`EXPO_PUBLIC_WS_URL`) จะถูก "ฝัง" เข้าไปในตัว APK ตอน build เลย ถ้าแก้ IP backend
ทีหลังต้อง build ใหม่เสมอ และมือถือที่ติดตั้ง APK ต้องอยู่วง WiFi เดียวกับเครื่อง
backend ตอนทดสอบด้วย

### ทางที่ 1: Build local ด้วย Android Studio (แนะนำถ้าไม่อยากสมัครบัญชี Expo)

**1. ติดตั้ง Android Studio** (ครั้งแรกครั้งเดียว)

ดาวน์โหลดจาก https://developer.android.com/studio แล้วติดตั้งตามปกติ ตอนเปิดครั้งแรก
เลือก "Standard" setup — มันจะติดตั้ง Android SDK, Platform Tools, และ emulator ให้
อัตโนมัติ (ใช้เวลาสักพัก ไฟล์ใหญ่หลาย GB)

**2. ตั้งค่า environment variable** (ครั้งแรกครั้งเดียว)

เปิด "Edit environment variables for your account" ใน Windows Search แล้วเพิ่ม:

- ตัวแปรใหม่ `ANDROID_HOME` = `C:\Users\<ชื่อผู้ใช้>\AppData\Local\Android\Sdk`
  (เช็ค path จริงได้ใน Android Studio: More Actions > SDK Manager > ดูช่อง
  "Android SDK Location" ด้านบน)
- แก้ตัวแปร `Path` เพิ่ม 2 บรรทัด:
  - `%ANDROID_HOME%\platform-tools`
  - `%ANDROID_HOME%\emulator`

ปิด-เปิด PowerShell ใหม่หลังตั้งค่าเสร็จ แล้วเช็คว่าใช้ได้ด้วย `adb --version`

**3. สร้างโปรเจกต์ native Android** (รันครั้งแรก หรือรันใหม่ถ้าแก้ native config)

```powershell
cd C:\Projects\iot-backend\mobile-app
npx expo prebuild --platform android
```

คำสั่งนี้สร้างโฟลเดอร์ `android/` (โค้ด native จริง ไม่ต้องแก้เอง) จาก `app.json`
ของเรา — โฟลเดอร์นี้ไม่ได้ commit เข้า git (มีใน `.gitignore` แล้ว) เพราะสร้างใหม่ได้
ทุกครั้งจากคำสั่งเดียวกันนี้

**4. Build + ติดตั้งลงเครื่อง/มือถือที่เสียบสาย USB โดยตรง** (ง่ายที่สุด)

เสียบมือถือ Android เข้าคอมด้วยสาย USB แล้วเปิด **USB debugging** ในมือถือก่อน
(Settings > About phone > กด "Build number" รัว ๆ 7 ครั้งเพื่อปลด Developer options
> เปิด USB debugging) เช็คว่าเครื่องเห็นมือถือด้วย `adb devices` แล้วรัน:

```powershell
npx expo run:android --variant release
```

คำสั่งนี้ build แล้วติดตั้ง + เปิดแอปบนมือถือที่เสียบอยู่ให้อัตโนมัติเลย (ใช้เวลา
ประมาณ 5-15 นาทีตอน build ครั้งแรก ครั้งถัดไปเร็วขึ้นมากเพราะ cache ไว้)

**5. หรือถ้าอยากได้ไฟล์ `.apk` เก็บไว้ส่งต่อ/ติดตั้งทีหลัง**

```powershell
cd android
.\gradlew assembleDebug
```

ไฟล์ APK จะอยู่ที่ `android\app\build\outputs\apk\debug\app-debug.apk` — ก๊อปปี้ไป
ไว้ในมือถือ (ส่งผ่าน LINE ตัวเอง, Google Drive, หรือลาก-วางผ่านสาย USB) แล้วเปิดไฟล์
เพื่อติดตั้ง (Android จะเตือน "Install unknown app" กด "อนุญาต"/"ติดตั้งแบบนี้" ได้เลย)

> `assembleDebug` ไม่ต้องตั้งค่า signing key ใด ๆ เหมาะกับทดสอบเองโดยเฉพาะ ถ้าจะแจก
> ให้คนอื่นทดสอบเป็นวงกว้างค่อยทำ `assembleRelease` ซึ่งต้องสร้าง keystore ก่อน (ดู
> https://reactnative.dev/docs/signed-apk-android)

### ทางที่ 2: EAS Build (build บน cloud ของ Expo ไม่ต้องลง Android Studio)

โปรเจกต์ตั้งค่า [EAS Build](https://docs.expo.dev/build/introduction/) ไว้ให้แล้ว
(ดู `eas.json`, profile `preview` จะได้ไฟล์ `.apk` ติดตั้งตรง) ทางนี้ต้องสมัครบัญชี
Expo ฟรี (ไม่ผูกบัตร มีโควตา build จำกัดต่อเดือน) ที่ https://expo.dev/signup ก่อน:

```powershell
cd mobile-app
npx eas-cli login
npx eas-cli init                                      # ครั้งแรกครั้งเดียว เชื่อมโปรเจกต์กับ EAS
npx eas-cli build --platform android --profile preview
```

รอประมาณ 10-20 นาที (build บน cloud ของ Expo) เสร็จแล้วได้ลิงก์ดาวน์โหลด `.apk`
ในเทอร์มินัล ดาวน์โหลดไปลงมือถือได้เลยเหมือนทางที่ 1

### iOS

Build เป็น `.ipa` ต้องมีบัญชี Apple Developer ($99/ปี) และติดตั้งผ่าน TestFlight
หรือลงทะเบียน device ไว้ล่วงหน้า — ซับซ้อนกว่า Android มาก ถ้าแค่ต้องการทดสอบเร็ว ๆ
แนะนำใช้ Expo Go บน iOS แทน (ดูหัวข้อ "เริ่มต้นใช้งาน" ด้านบน)
