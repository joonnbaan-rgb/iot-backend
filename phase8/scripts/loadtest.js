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

let cachedToken = null;

function ensureAuth() {
  if (cachedToken) return cachedToken;

  // พยายาม register ก่อน (เผื่อ user ยังไม่มี) แล้วค่อย login — ถ้า register ล้มเหลวเพราะมี user อยู่แล้วก็ไม่เป็นไร
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

  check(loginRes, { 'login ok': (r) => r.status === 200 || r.status === 201 });

  if (loginRes.status === 200 || loginRes.status === 201) {
    cachedToken = JSON.parse(loginRes.body).accessToken;
  }
  return cachedToken;
}

export default function () {
  // 1) Health check — endpoint สาธารณะ ไม่ต้อง auth
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, { 'health status is 200': (r) => r.status === 200 });

  // 2) Auth + authenticated endpoint
  const token = ensureAuth();
  if (token) {
    const devicesRes = http.get(`${BASE_URL}/devices`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    check(devicesRes, {
      'devices list status is 200': (r) => r.status === 200,
    });
  }

  sleep(1);
}
