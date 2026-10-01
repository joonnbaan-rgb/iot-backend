/**
 * จำลองว่า MediaMTX บันทึกคลิปใหม่เสร็จแล้ว (เขียนไฟล์ .mp4 ลงโฟลเดอร์ recordings)
 * ไว้ทดสอบว่า RecordingsService (scan ทุก 15 วินาที) อัปโหลดขึ้น MinIO ได้จริงหรือไม่
 * โดยไม่ต้องมีกล้องจริงหรือรอ MediaMTX บันทึกจริง
 *
 * หมายเหตุ: ไฟล์ที่สร้างเป็นแค่ dummy content ไม่ใช่วิดีโอ .mp4 จริง ใช้เทสต์ pipeline การอัปโหลดเท่านั้น
 *
 * วิธีใช้:
 *   node scripts/simulate-camera-clip.js <device_id>
 */
const fs = require('fs');
const path = require('path');

const deviceId = process.argv[2];
if (!deviceId) {
  console.error('ต้องระบุ device_id เช่น: node scripts/simulate-camera-clip.js <device_id>');
  process.exit(1);
}

const recordingsDir = process.env.RECORDINGS_DIR || './recordings';
const deviceDir = path.join(recordingsDir, deviceId);
fs.mkdirSync(deviceDir, { recursive: true });

const filename = `${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`;
const filePath = path.join(deviceDir, filename);

fs.writeFileSync(filePath, `dummy clip content สำหรับทดสอบ - สร้างเมื่อ ${new Date().toISOString()}`);

console.log(`สร้างไฟล์คลิปจำลองที่: ${filePath}`);
console.log('รอ backend ~15-20 วินาที (รอบ scan) แล้วเช็คว่าถูกอัปโหลดขึ้น MinIO หรือยังผ่าน:');
console.log(`  GET /devices/${deviceId}/camera/recordings`);
