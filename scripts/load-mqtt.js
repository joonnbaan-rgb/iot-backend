#!/usr/bin/env node
/**
 * ทดสอบโหลดท่อรับ telemetry: จำลองอุปกรณ์จำนวนมากส่งค่าเข้า MQTT แล้ววัดว่าข้อมูลเข้า DB ครบไหม
 *
 *   node scripts/load-mqtt.js --email admin@example.com --password '...' --devices 200 --interval 1000 --duration 60
 *
 * ตัวเลือก
 *   --api       http://localhost:3000     URL ของ backend
 *   --mqtt      mqtt://localhost:1883     URL ของ MQTT broker
 *   --mqtt-user / --mqtt-pass             บัญชี MQTT (dev ปล่อยว่างได้; production ใช้บัญชี backend จาก deploy/.env.prod)
 *   --devices   200                       จำนวนอุปกรณ์จำลอง (ถูกสร้างจริงผ่าน API ชื่อขึ้นต้น "loadtest-")
 *   --interval  1000                      ส่งทุกกี่ ms ต่ออุปกรณ์ (200 อุปกรณ์ x 1000ms = 200 msg/s)
 *   --duration  60                        ระยะเวลาทดสอบ (วินาที)
 *   --connections 10                      จำนวน MQTT connection ที่ใช้ส่ง
 *   --metrics   http://localhost:3000/metrics   (ไม่บังคับ) อ่านตัวนับของ backend มาเทียบ
 *   --keep                                ไม่ลบอุปกรณ์ทดสอบหลังจบ
 *   --cleanup                             ลบอุปกรณ์ "loadtest-*" ที่ค้างจากรอบก่อนแล้วจบ
 *
 * หมายเหตุ: อุปกรณ์ทดสอบถูกสร้างใต้บัญชีที่ล็อกอิน; ใช้กับระบบจริงให้ระวังเรื่อง rate limit และพื้นที่ DB
 */
const mqtt = require('mqtt');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const k = a.slice(2);
  const nx = process.argv[i + 1];
  if (nx === undefined || nx.startsWith('--')) args[k] = true;
  else {
    args[k] = nx;
    i++;
  }
}
const API = String(args.api || 'http://localhost:3000').replace(/\/$/, '');
const MQTT_URL = String(args.mqtt || 'mqtt://localhost:1883');
const N = parseInt(args.devices || '200', 10);
const INTERVAL = parseInt(args.interval || '1000', 10);
const DURATION = parseInt(args.duration || '60', 10);
const CONNS = Math.min(parseInt(args.connections || '10', 10), N);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!args.email || !args.password) {
  console.error('ต้องระบุ --email และ --password ของบัญชีที่ล็อกอินได้');
  process.exit(1);
}

let token = '';
async function call(method, path, body, attempt = 0) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429 && attempt < 8) {
    await sleep(2000 * (attempt + 1)); // ชนโควตา rate limit → รอแล้วลองใหม่
    return call(method, path, body, attempt + 1);
  }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.status === 204 ? null : res.json().catch(() => null);
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    }),
  );
  return out;
}

async function readCounters() {
  if (!args.metrics) return null;
  try {
    const text = await (await fetch(String(args.metrics))).text();
    const sum = (re) =>
      text
        .split('\n')
        .filter((l) => re.test(l))
        .reduce((a, l) => a + Number(l.split(' ').pop()), 0);
    return {
      ok: sum(/^iot_ingest_processed_total\{result="ok"\}/),
      invalid: sum(/^iot_ingest_processed_total\{result="invalid"\}/),
      dead: sum(/^iot_ingest_processed_total\{result="dead"\}/),
      queued: sum(/^iot_ingest_enqueued_total\{result="queued"\}/),
      fallback: sum(/^iot_ingest_enqueued_total\{result="fallback_direct"\}/),
    };
  } catch (e) {
    console.warn('อ่าน /metrics ไม่ได้:', e.message);
    return null;
  }
}

async function main() {
  const login = await call('POST', '/auth/login', { email: args.email, password: args.password });
  token = login.access_token;

  if (args.cleanup) {
    const list = await call('GET', '/devices');
    const mine = (Array.isArray(list) ? list : list.items || []).filter((d) => String(d.name).startsWith('loadtest-'));
    await pool(mine, 5, (d) => call('DELETE', `/devices/${d.id}`));
    console.log(`ลบอุปกรณ์ทดสอบ ${mine.length} ตัวแล้ว`);
    return;
  }

  console.log(`สร้างอุปกรณ์ทดสอบ ${N} ตัว...`);
  const stamp = Date.now().toString(36);
  const devices = await pool(Array.from({ length: N }, (_, i) => i), 5, (i) =>
    call('POST', '/devices', { name: `loadtest-${stamp}-${i}`, type: 'sensor', location: 'loadtest' }),
  );
  const ids = devices.map((d) => d.id);

  const before = await readCounters();
  const startedAt = new Date();
  const sent = new Map(ids.map((id) => [id, 0]));

  console.log(`เชื่อม MQTT ${CONNS} connection ไปที่ ${MQTT_URL}`);
  const clients = await Promise.all(
    Array.from({ length: CONNS }, (_, i) =>
      new Promise((resolve, reject) => {
        const c = mqtt.connect(MQTT_URL, {
          clientId: `loadtest-${stamp}-${i}`,
          username: args['mqtt-user'] ? String(args['mqtt-user']) : undefined,
          password: args['mqtt-pass'] ? String(args['mqtt-pass']) : undefined,
        });
        c.once('connect', () => resolve(c));
        c.once('error', reject);
      }),
    ),
  );

  const total = (N * 1000) / INTERVAL;
  console.log(`ส่งข้อมูล ~${total.toFixed(0)} msg/s นาน ${DURATION}s (${N} อุปกรณ์ x ทุก ${INTERVAL}ms)`);

  const timers = ids.map((id, idx) => {
    const client = clients[idx % CONNS];
    return new Promise((resolve) => {
      // กระจายจังหวะเริ่มของแต่ละอุปกรณ์ ไม่ให้ส่งพร้อมกันเป็นก้อนเดียว
      setTimeout(() => {
        const t = setInterval(() => {
          client.publish(
            `devices/${id}/telemetry`,
            JSON.stringify({ value: 20 + Math.random() * 10, unit: 'C' }),
            { qos: 1 },
          );
          sent.set(id, sent.get(id) + 1);
        }, INTERVAL);
        setTimeout(() => {
          clearInterval(t);
          resolve();
        }, DURATION * 1000);
      }, Math.random() * INTERVAL);
    });
  });
  await Promise.all(timers);

  console.log('หยุดส่งแล้ว รอให้ท่อระบายข้อมูล...');
  await Promise.all(clients.map((c) => new Promise((r) => c.end(false, {}, r))));
  const sentTotal = [...sent.values()].reduce((a, b) => a + b, 0);

  // รอจนจำนวนแถวใน DB นิ่ง (สูงสุด 60 วินาที)
  const countRows = async () => {
    const counts = await pool(ids, 10, async (id) => {
      const r = await call(
        'GET',
        `/devices/${id}/telemetry/summary?bucket=1m&from=${encodeURIComponent(startedAt.toISOString())}`,
      );
      return r.points.reduce((a, p) => a + p.n, 0);
    });
    return counts.reduce((a, b) => a + b, 0);
  };
  let rows = await countRows();
  for (let i = 0; i < 12 && rows < sentTotal; i++) {
    await sleep(5000);
    const next = await countRows();
    if (next === rows) break;
    rows = next;
  }

  const after = await readCounters();
  const loss = sentTotal ? (100 * (sentTotal - rows)) / sentTotal : 0;
  console.log('\n===== ผลทดสอบ =====');
  console.log(`อุปกรณ์            : ${N}`);
  console.log(`ส่งทั้งหมด         : ${sentTotal} msg (${(sentTotal / DURATION).toFixed(0)} msg/s เฉลี่ย)`);
  console.log(`เข้า DB            : ${rows} แถว`);
  console.log(`สูญหาย/ยังไม่เข้า  : ${sentTotal - rows} (${loss.toFixed(2)}%)`);
  if (before && after) {
    console.log(
      `ตัวนับ backend     : ok +${after.ok - before.ok}, invalid +${after.invalid - before.invalid}, dead +${after.dead - before.dead}, queued +${after.queued - before.queued}, fallback +${after.fallback - before.fallback}`,
    );
  }
  console.log('ดูกราฟ lag/คิวค้างได้ที่ Grafana > IoT Overview');

  if (!args.keep) {
    await pool(ids, 5, (id) => call('DELETE', `/devices/${id}`).catch(() => null));
    console.log('ลบอุปกรณ์ทดสอบพร้อมข้อมูลของมันแล้ว');
  } else {
    console.log(`เก็บอุปกรณ์ไว้ (ชื่อ loadtest-${stamp}-*) ลบทีหลังด้วย --cleanup`);
  }
  process.exit(loss > 1 ? 2 : 0);
}

main().catch((e) => {
  console.error('ผิดพลาด:', e.message);
  process.exit(1);
});
