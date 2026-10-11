import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * เฟสสมัครใช้งานเชิงพาณิชย์:
 *  - users: สถานะบัญชี (active|suspended), โควตาอุปกรณ์/ไซต์รายคน (NULL = ใช้ค่าเริ่มต้นจาก env), last_login_at
 *  - device_shares: เพิ่มสิทธิ์ 'manage' (ผู้จัดการร่วม)
 *  - pending_shares: แชร์ให้อีเมลที่ยังไม่สมัคร จะถูกนำไปใช้อัตโนมัติเมื่อสมัคร
 *  - password_resets: รหัสรีเซ็ตรหัสผ่าน (เก็บเฉพาะ hash)
 */
export class SelfService1700001300000 implements MigrationInterface {
  name = 'SelfService1700001300000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" ADD COLUMN "status" varchar(16) NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','suspended'))`);
    await q.query(`ALTER TABLE "users" ADD COLUMN "device_quota" integer NULL CHECK ("device_quota" IS NULL OR "device_quota" >= 0)`);
    await q.query(`ALTER TABLE "users" ADD COLUMN "site_quota" integer NULL CHECK ("site_quota" IS NULL OR "site_quota" >= 0)`);
    await q.query(`ALTER TABLE "users" ADD COLUMN "last_login_at" timestamptz NULL`);

    await q.query(`ALTER TABLE "device_shares" DROP CONSTRAINT IF EXISTS "device_shares_permission_check"`);
    await q.query(
      `ALTER TABLE "device_shares" ADD CONSTRAINT "device_shares_permission_check" CHECK ("permission" IN ('view','control','manage'))`,
    );

    await q.query(`
      CREATE TABLE "pending_shares" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "email" varchar(255) NOT NULL,
        "device_id" uuid NULL REFERENCES "devices"("id") ON DELETE CASCADE,
        "group_id" uuid NULL REFERENCES "device_groups"("id") ON DELETE CASCADE,
        "permission" varchar(16) NOT NULL DEFAULT 'view' CHECK ("permission" IN ('view','control','manage')),
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX "idx_pending_shares_email" ON "pending_shares" (LOWER("email"))`);
    await q.query(`CREATE INDEX "idx_pending_shares_owner" ON "pending_shares" ("owner_id")`);

    await q.query(`
      CREATE TABLE "password_resets" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "code_hash" varchar(64) NOT NULL,
        "attempts" smallint NOT NULL DEFAULT 0,
        "expires_at" timestamptz NOT NULL,
        "used_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX "idx_password_resets_user" ON "password_resets" ("user_id", "created_at" DESC)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "password_resets"`);
    await q.query(`DROP TABLE IF EXISTS "pending_shares"`);
    await q.query(`DELETE FROM "device_shares" WHERE "permission" = 'manage'`);
    await q.query(`ALTER TABLE "device_shares" DROP CONSTRAINT IF EXISTS "device_shares_permission_check"`);
    await q.query(
      `ALTER TABLE "device_shares" ADD CONSTRAINT "device_shares_permission_check" CHECK ("permission" IN ('view','control'))`,
    );
    await q.query(`ALTER TABLE "users" DROP COLUMN "last_login_at"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN "site_quota"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN "device_quota"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN "status"`);
  }
}
