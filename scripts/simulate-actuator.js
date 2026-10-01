/**
 * จำลองอุปกรณ์ไฟฟ้า (actuator): subscribe รอรับคำสั่งจาก backend แล้วตอบ ack กลับ
 * วิธีใช้:
 *   node scripts/simulate-actuator.js <device_id> [mqttUrl]
 * ตัวอย่าง:
 *   node scripts/simulate-actuator.js b3f1... 
 *
 * ปล่อยให้รันค้างไว้ในอีก terminal หนึ่ง แล้วค่อยยิง POST /devices/:id/commands จากอีกฝั่ง
 */
const mqtt = require('mqtt');

const deviceId = process.argv[2];
const mqttUrl = process.argv[3] || process.env.MQTT_URL || 'mqtt://localhost:1883';

if (!deviceId) {
  console.error('ต้องระบุ device_id เช่น: node scripts/simulate-actuator.js <device_id>');
  process.exit(1);
}

const commandTopic = `devices/${deviceId}/command`;
const ackTopic = `devices/${deviceId}/ack`;

console.log(`กำลังเชื่อมต่อ ${mqttUrl} เพื่อจำลองอุปกรณ์ไฟฟ้า (device_id: ${deviceId})`);
const client = mqtt.connect(mqttUrl);

client.on('connect', () => {
  console.log(`เชื่อมต่อสำเร็จ กำลังรอคำสั่งที่ topic "${commandTopic}"... (Ctrl+C เพื่อหยุด)`);
  client.subscribe(commandTopic, { qos: 1 });
});

client.on('message', (topic, payloadBuffer) => {
  if (topic !== commandTopic) return;

  let payload;
  try {
    payload = JSON.parse(payloadBuffer.toString());
  } catch {
    console.error('ได้รับ payload ที่ไม่ใช่ JSON');
    return;
  }
  console.log('ได้รับคำสั่ง:', payload);

  // จำลองเวลาทำงานจริงของอุปกรณ์ (เช่น รีเลย์สลับหน้าสัมผัส) 1 วินาที แล้วตอบว่าสำเร็จ
  setTimeout(() => {
    const ack = JSON.stringify({ command_id: payload.command_id, status: 'success' });
    client.publish(ackTopic, ack, { qos: 1 });
    console.log('ส่ง ack กลับ:', ack);
  }, 1000);
});

client.on('error', (err) => {
  console.error('MQTT error:', err.message);
});
