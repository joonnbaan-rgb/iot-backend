// k6 load test สำหรับ IoT Backend
// ติดตั้ง k6: https://k6.io/docs/get-started/installation/ (บน Windows: choco install k6 หรือ winget install k6)
// รัน: k6 run loadtest.js
// รันพร้อมกำหนด URL/credentials เอง:
//   k6 run -e BASE_URL=http://localhost:3000 -e EMAIL=admin@example.com -e PASSWORD=changeme loadtest.js

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const EMAIL = __ENV.EMAIL || 'loadtest@example.com';
const PASSWORD = __ENV.PASSWORD || 'LoadTest123!';

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
      tags: { scenario: 'smoke' },
    },
    load: {
      executor: 'ramping-vus',
      startTime: '35s',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '1m', target: 20 },
        { duration: '20s', target: 0 },
      ],
      tags: { scenario: 'load' },
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% ของ request ต้องเร็วกว่า 500ms
    http_req_failed: ['rate<0.01'],   // error rate ต้องน้อยกว่า 1%
  },
};

// --- setup() รันแค่ครั้งเดียวก่อนเริ่มโหลดเทสต์ (ไม่นับรวมใน VU/iteration ใด ๆ) ---
// สำคัญ: login แค่ครั้งเดียวที่นี่ แล้วแชร์ token เดียวกันให้ทุก VU ใช้ร่วมกัน
// เพราะ /auth/login ถูก rate-limit ไว้ที่ 5 ครั้ง/นาที (กัน brute-force) — ถ้าให้ทุก VU
// login เองจะชน rate limit นี้ทันทีเมื่อมี VU พร้อมกันหลายสิบตัว (เหมือนที่เคยเกิดขึ้นจริง
// ตอนรันครั้งแรก ได้ error rate 98%)
export function setup() {
  // พยายาม register ก่อน (เผื่อ user ยังไม่มี) — ถ้ามีอยู่แล้วจะได้ 409 ซึ่งไม่เป็นไร
  http.post(
    `${BASE_URL}/auth/register`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  if (loginRes.status !== 200 && loginRes.status !== 201) {
    throw new Error(
      `setup(): login ล้มเหลว (status ${loginRes.status}) — ตรวจสอบว่า backend รันอยู่ และ EMAIL/PASSWORD ถูกต้อง: ${loginRes.body}`,
    );
  }

  const token = JSON.parse(loginRes.body).accessToken;
  return { token };
}

export default function (data) {
  // 1) Health check — endpoint สาธารณะ ไม่ต้อง auth และไม่ถูก rate limit (SkipThrottle)
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, { 'health status is 200': (r) => r.status === 200 });

  // 2) Authenticated endpoint — ใช้ token เดียวกันที่ login ไว้ใน setup() ไม่ login ซ้ำทุก VU
  const devicesRes = http.get(`${BASE_URL}/devices`, {
    headers: { Authorization: `Bearer ${data.token}` },
  });
  check(devicesRes, {
    'devices list status is 200': (r) => r.status === 200,
  });

  sleep(1);
}
