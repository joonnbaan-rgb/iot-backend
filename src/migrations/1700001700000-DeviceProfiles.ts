import { MigrationInterface, QueryRunner } from 'typeorm';

/** แคตตาล็อกโปรไฟล์อุปกรณ์ (รุ่น/ยี่ห้อ -> ค่าตั้งต้น, RTSP URL, ขั้นตอน/โค้ดตั้งค่าในตัวอุปกรณ์) — แถว builtin ถูก seed ตอน backend เริ่มทำงาน */
export class DeviceProfiles1700001700000 implements MigrationInterface {
  name = 'DeviceProfiles1700001700000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "device_profiles" (
        "id" varchar(64) PRIMARY KEY,
        "vendor" varchar(64) NOT NULL,
        "model" varchar(128) NOT NULL,
        "device_type" varchar(16) NOT NULL CHECK ("device_type" IN ('sensor','camera','actuator')),
        "protocol" varchar(16) NOT NULL CHECK ("protocol" IN ('rtsp','mqtt')),
        "integration" varchar(16) NOT NULL CHECK ("integration" IN ('rtsp','direct','script','rule','bridge','planned')),
        "description" text NOT NULL DEFAULT '',
        "default_name" varchar(128) NOT NULL DEFAULT '',
        "default_unit" varchar(32) NULL,
        "fields" jsonb NOT NULL DEFAULT '[]',
        "rtsp_templates" jsonb NOT NULL DEFAULT '[]',
        "steps" jsonb NOT NULL DEFAULT '[]',
        "snippets" jsonb NOT NULL DEFAULT '[]',
        "links" jsonb NOT NULL DEFAULT '[]',
        "notes" text NOT NULL DEFAULT '',
        "tags" text[] NOT NULL DEFAULT '{}',
        "source" varchar(8) NOT NULL DEFAULT 'custom' CHECK ("source" IN ('builtin','custom')),
        "enabled" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX "idx_device_profiles_type" ON "device_profiles" ("device_type", "vendor")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "device_profiles"`);
  }
}
