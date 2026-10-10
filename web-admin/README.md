# Web Admin

หน้าเว็บจัดการระบบ IoT (React + Vite + TypeScript): แดชบอร์ด, อุปกรณ์ (กราฟ/คำสั่ง/กล้อง HLS), ไซต์และสมาชิก, การแจ้งเตือน, ผู้ดูแล (ผู้ใช้/รหัสเชิญ)

## รันตอนพัฒนา
```
cd web-admin
npm install
copy .env.example .env      # แก้ VITE_API_BASE_URL ให้ชี้ backend
npm run dev                 # http://localhost:5173
```

## Build
```
npm run build               # ได้โฟลเดอร์ dist/
```
บน cloud: `docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build webadmin caddy`
