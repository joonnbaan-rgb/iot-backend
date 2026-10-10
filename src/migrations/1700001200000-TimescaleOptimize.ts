import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * เฟส H: ปรับ TimescaleDB ให้รองรับข้อมูลจำนวนมาก
 *   - index (device_id, recorded_at DESC) สำหรับ query รายอุปกรณ์
 *   - compression: บีบอัด chunk ที่เก่ากว่า 7 วัน (segment ตามอุปกรณ์)
 *   - continuous aggregates: สรุปรายละ 5 นาที / รายชั่วโมง (ใช้วาดกราฟช่วงยาวโดยไม่ต้องสแกนข้อมูลดิบ)
 *   - retention: ลบข้อมูลดิบที่เก่ากว่า 180 วัน (ข้อมูลสรุปรายชั่วโมงเก็บตลอด, รายละ 5 นาทีเก็บ 1 ปี)
 *
 * แต่ละขั้นห่อด้วย DO ... EXCEPTION: ถ้าเวอร์ชัน TimescaleDB ไม่รองรับขั้นใด จะแจ้งเตือน (WARNING)
 * แล้วข้ามไป ไม่ทำให้ migration ล้ม — ระบบยังทำงานได้ (API สรุปจะ fallback ไปคำนวณจากข้อมูลดิบ)
 * ตรวจผลหลังรัน: ดูหัวข้อ "ตรวจว่า Timescale ตั้งค่าครบ" ใน docs/SCALE.md
 *
 * ข้อมูลเก่าที่มีอยู่ก่อนรัน migration นี้: continuous aggregate สร้างแบบ WITH NO DATA และ policy จะ refresh
 * ย้อนหลังแค่ 30 วัน (5 นาที) / 90 วัน (รายชั่วโมง) — ต้องสั่ง backfill เองหนึ่งครั้งนอก transaction
 * (คำสั่งอยู่ใน docs/SCALE.md หัวข้อ "Backfill ข้อมูลเก่า")
 *
 * เปลี่ยน retention ภายหลัง:
 *   SELECT remove_retention_policy('sensor_data');
 *   SELECT add_retention_policy('sensor_data', INTERVAL '365 days');
 */
export class TimescaleOptimize1700001200000 implements MigrationInterface {
  name = 'TimescaleOptimize1700001200000';

  private async safe(q: QueryRunner, label: string, sql: string) {
    await q.query(
      `DO $phase_h$ BEGIN ${sql}; EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Phase H: ข้าม "${label}": %', SQLERRM; END $phase_h$`,
    );
  }

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_sensor_data_device_time" ON "sensor_data" ("device_id", "recorded_at" DESC)`,
    );

    // ---- compression
    await this.safe(
      q,
      'compression settings',
      `ALTER TABLE sensor_data SET (timescaledb.compress, timescaledb.compress_segmentby = 'device_id', timescaledb.compress_orderby = 'recorded_at DESC, id')`,
    );
    await this.safe(
      q,
      'compression policy',
      `PERFORM add_compression_policy('sensor_data', INTERVAL '7 days', if_not_exists => true)`,
    );

    // ---- continuous aggregates (WITH NO DATA เพื่อให้รันใน transaction ได้; policy จะ backfill ให้เอง)
    for (const [view, bucket] of [
      ['sensor_data_5m', '5 minutes'],
      ['sensor_data_1h', '1 hour'],
    ]) {
      await this.safe(
        q,
        `create ${view}`,
        `CREATE MATERIALIZED VIEW IF NOT EXISTS ${view} WITH (timescaledb.continuous) AS
           SELECT time_bucket('${bucket}', recorded_at) AS bucket,
                  device_id,
                  sum(value) AS sum_value,
                  min(value) AS min_value,
                  max(value) AS max_value,
                  count(*)   AS samples,
                  last(value, recorded_at) AS last_value
           FROM sensor_data
           GROUP BY bucket, device_id
           WITH NO DATA`,
      );
      await this.safe(q, `realtime ${view}`, `ALTER MATERIALIZED VIEW ${view} SET (timescaledb.materialized_only = false)`);
    }

    // หมายเหตุ: ช่วง refresh ต้องสั้นกว่า retention ของข้อมูลดิบ ไม่งั้นสรุปเก่าจะถูกคำนวณใหม่จนว่างเปล่า
    await this.safe(
      q,
      'policy 5m',
      `PERFORM add_continuous_aggregate_policy('sensor_data_5m', start_offset => INTERVAL '30 days', end_offset => INTERVAL '5 minutes', schedule_interval => INTERVAL '5 minutes', if_not_exists => true)`,
    );
    await this.safe(
      q,
      'policy 1h',
      `PERFORM add_continuous_aggregate_policy('sensor_data_1h', start_offset => INTERVAL '90 days', end_offset => INTERVAL '1 hour', schedule_interval => INTERVAL '1 hour', if_not_exists => true)`,
    );

    // ---- retention
    await this.safe(q, 'retention raw', `PERFORM add_retention_policy('sensor_data', INTERVAL '180 days', if_not_exists => true)`);
    await this.safe(q, 'retention 5m', `PERFORM add_retention_policy('sensor_data_5m', INTERVAL '365 days', if_not_exists => true)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await this.safe(q, 'rm retention 5m', `PERFORM remove_retention_policy('sensor_data_5m', if_exists => true)`);
    await this.safe(q, 'rm retention raw', `PERFORM remove_retention_policy('sensor_data', if_exists => true)`);
    await this.safe(q, 'rm policy 1h', `PERFORM remove_continuous_aggregate_policy('sensor_data_1h', if_exists => true)`);
    await this.safe(q, 'rm policy 5m', `PERFORM remove_continuous_aggregate_policy('sensor_data_5m', if_exists => true)`);
    await this.safe(q, 'drop 1h', `DROP MATERIALIZED VIEW IF EXISTS sensor_data_1h`);
    await this.safe(q, 'drop 5m', `DROP MATERIALIZED VIEW IF EXISTS sensor_data_5m`);
    await this.safe(q, 'rm compression', `PERFORM remove_compression_policy('sensor_data', if_exists => true)`);
    await q.query(`DROP INDEX IF EXISTS "IDX_sensor_data_device_time"`);
  }
}
