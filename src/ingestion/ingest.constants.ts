// ชื่อคีย์/กลุ่มของ Redis Stream ที่ใช้รับ telemetry (ใช้ร่วมกันระหว่าง producer และ worker)
export const INGEST_STREAM = 'iot:telemetry';
export const INGEST_GROUP = 'ingest';
export const INGEST_DEAD_STREAM = 'iot:telemetry:dead';
