/**
 * ใช้ทดสอบ Phase 2 โดยไม่ต้องมีเซนเซอร์จริง
 * วิธีใช้:
 *   node scripts/simulate-sensor.js <device_id> [intervalMs] [mqttUrl]
 * ตัวอย่าง:
 *   node scripts/simulate-sensor.js 4749d573-40b1-4080-a16d-15fc918ca374
 */
const mqtt = require('mqtt');

const deviceId = process.argv[2];
const intervalMs = parseInt(process.argv[3] || '5000', 10);
const mqttUrl = process.argv[4] || process.env.MQTT_URL || 'mqtt://localhost:1883';

if (!deviceId) {
  console.error('ต้องระบุ device_id เช่น: node scripts/simulate-sensor.js <device_id>');
  process.exit(1);
}

const topic = `devices/${deviceId}/telemetry`;
console.log(`กำลังเชื่อมต่อ ${mqttUrl} เพื่อจำลองส่งข้อมูลไปที่ topic "${topic}" ทุก ${intervalMs}ms`);

const client = mqtt.connect(mqttUrl);

client.on('connect', () => {
  console.log('เชื่อมต่อสำเร็จ กำลังเริ่มส่งข้อมูลจำลอง... (กด Ctrl+C เพื่อหยุด)');

  setInterval(() => {
    const payload = JSON.stringify({
      value: parseFloat((20 + Math.random() * 10).toFixed(2)),
      unit: 'celsius',
      recorded_at: new Date().toISOString(),
    });
    client.publish(topic, payload, { qos: 1 }, (err) => {
      if (err) {
        console.error('ส่งข้อมูลล้มเหลว:', err.message);
      } else {
        console.log('ส่งข้อมูลแล้ว:', payload);
      }
    });
  }, intervalMs);
});

client.on('error', (err) => {
  console.error('MQTT error:', err.message);
});
