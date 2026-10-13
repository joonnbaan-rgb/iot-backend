import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ระบบแนะนำสมาชิก + ปรับสิทธิ์รายคน
 *  - users.referral_code: รหัสแนะนำประจำตัว (ผู้ใช้เดิมถูกสร้างให้อัตโนมัติ)
 *  - users.plan_overrides: สิทธิ์รายคนที่ admin กำหนดทับแพ็กเกจ (jsonb: camera_quota, recording_enabled, notification_types, retention_days, retention_unlimited)
 *  - referrals: บันทึกการแนะนำ (ผู้แนะนำ -> ผู้ถูกแนะนำ) และจำนวนวันโปรโมชันที่ให้
 *  - app_settings: ตั้งค่าระบบแบบ key/value (ใช้เก็บโปรโมชันแนะนำสมาชิก)
 */
export class Referrals1700001600000 implements MigrationInterface {
  name = 'Referrals1700001600000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" ADD COLUMN "plan_overrides" jsonb NULL`);
    await q.query(`ALTER TABLE "users" ADD COLUMN "referral_code" varchar(12) NULL`);
    await q.query(`UPDATE "users" SET "referral_code" = upper(substr(md5(random()::text || id::text), 1, 8))`);
    await q.query(`CREATE UNIQUE INDEX "uq_users_referral_code" ON "users" ("referral_code")`);

    await q.query(`
      CREATE TABLE "app_settings" (
        "key" varchar(64) PRIMARY KEY,
        "value" jsonb NOT NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`
      CREATE TABLE "referrals" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "inviter_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "invitee_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
        "inviter_days" integer NOT NULL DEFAULT 0,
        "invitee_days" integer NOT NULL DEFAULT 0,
        "rewarded_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX "idx_referrals_inviter" ON "referrals" ("inviter_id")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "referrals"`);
    await q.query(`DROP TABLE IF EXISTS "app_settings"`);
    await q.query(`DROP INDEX IF EXISTS "uq_users_referral_code"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN "referral_code"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN "plan_overrides"`);
  }
}
