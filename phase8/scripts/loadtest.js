// k6 load test สำหรับ IoT Backend
// ติดตั้ง k6: https://k6.io/docs/get-started/installation/ (บน Windows: choco install k6 หรือ winget install k6)
// รัน: k6 run loadtest.js
// รันพร้อมกำหนด URL เอง:
//   k6 run -e BASE_URL=http://localhost:3000 loadtest.js

import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// จำนวน "ผู้ใช้จำลอง" แยกบัญชีกัน — ต้อง <= 5 เพราะ /auth/login ถูก rate-limit ไว้ที่
// 5 ครั้ง/นาที (กัน brute-force) ทำให้ setup() login ได้สูงสุดแค่ 5 บัญชีต่อการรันหนึ่งครั้ง
// แต่ละ VU จะถูกจับคู่ (round-robin) กับหนึ่งใน 5 บัญชีนี้ ไม่ใช่ใช้บัญชีเดียวกันทั้งหมด —
// สำคัญมาก เพราะ backend จำกัดโควตาแบบ per-user (300 req/min/user, ดู UserThrottlerGuard)
// ถ้าทุก VU ใช้ user เดียวกัน จะเท่ากับยัด 20 "ผู้ใช้" ไปแย่ง quota ของ user คนเดียว
// ซึ่งไม่สมจริงกับการใช้งานจริงที่แต่ละคนมี account และ quota แยกกัน
const POOL_SIZE = 5;
const PASSWORD = __ENV.PASSWORD || 'LoadTest123!';

export const options = {
  setupTimeout: '60s',
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

// --- setup() รันแค่ครั้งเดียวก่อนเริ่มโหลดเทสต์ ---
// สร้าง/login บัญชีทดสอบ POOL_SIZE บัญชี แล้วแชร์ token แต่ละอันให้ VU คนละกลุ่มใช้
export function setup() {
  const tokens = [];

  for (let i = 0; i < POOL_SIZE; i++) {
    const email = `loadtest${i}@example.com`;

    // พยายาม register ก่อน (เผื่อ user ยังไม่มี) — ถ้ามีอยู่แล้วจะได้ 409 ซึ่งไม่เป็นไร
    http.post(
      `${BASE_URL}/auth/register`,
      JSON.stringify({ email, password: PASSWORD }),
      { headers: { 'Content-Type': 'application/json' } },
    );

    const loginRes = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email, password: PASSWORD }),
      { headers: { 'Content-Type': 'application/json' } },
    );

    if (loginRes.status !== 200 && loginRes.status !== 201) {
      throw new Error(
        `setup(): login บัญชี ${email} ล้มเหลว (status ${loginRes.status}): ${loginRes.body}`,
      );
    }

    // หมายเหตุ: API ตอบกลับด้วย field ชื่อ access_token (snake_case) ไม่ใช่ accessToken
    tokens.push(JSON.parse(loginRes.body).access_token);
  }

  return { tokens };
}

export default function (data) {
  // 1) Health check — endpoint สาธารณะ ไม่ต้อง auth และไม่ถูก rate limit (SkipThrottle)
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, { 'health status is 200': (r) => r.status === 200 });

  // 2) Authenticated endpoint — แต่ละ VU ใช้ token คนละบัญชี (round-robin ตาม __VU)
  // เพื่อจำลองผู้ใช้จริงหลายคนที่มี quota แยกกัน ไม่ใช่ยัดทุก VU ไปแย่ง quota บัญชีเดียว
  const token = data.tokens[__VU % data.tokens.length];
  const devicesRes = http.get(`${BASE_URL}/devices`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  check(devicesRes, {
    'devices list status is 200': (r) => r.status === 200,
  });

  sleep(1);
}
