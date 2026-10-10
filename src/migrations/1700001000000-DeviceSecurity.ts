import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * เฟส E: รหัสเชื่อมต่อ MQTT ราย device + ใบเชิญสมัครสมาชิก
 *  - devices.mqtt_secret_hash: SHA-256 ของรหัส (รหัสเป็นค่าสุ่มยาว จึงไม่ต้องใช้ bcrypt) ไม่เก็บรหัสจริง
 *  - invites: เก็บเฉพาะ hash ของรหัสเชิญ
 */
export class DeviceSecurity1700001000000 implements MigrationInterface {
  name = 'DeviceSecurity1700001000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "devices" ADD COLUMN "mqtt_secret_hash" varchar(64) NULL`);
    await q.query(`ALTER TABLE "devices" ADD COLUMN "mqtt_credentials_at" timestamptz NULL`);
    await q.query(`
      CREATE TABLE "invites" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "code_hash" varchar(64) NOT NULL UNIQUE,
        "email" varchar(255) NULL,
        "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "expires_at" timestamptz NOT NULL,
        "used_at" timestamptz NULL,
        "used_by" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "invites"`);
    await q.query(`ALTER TABLE "devices" DROP COLUMN "mqtt_credentials_at"`);
    await q.query(`ALTER TABLE "devices" DROP COLUMN "mqtt_secret_hash"`);
  }
}
