import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ระบบสมาชิก (แพ็กเกจ + วันหมดอายุ)
 *  - plans: แพ็กเกจและข้อจำกัด (โควตาอุปกรณ์/ไซต์/กล้อง, บันทึกคลิป, ช่องทางแจ้งเตือน, อายุเก็บข้อมูลเซนเซอร์)
 *  - users.plan_id / plan_expires_at: แพ็กเกจของผู้ใช้ (expires NULL = ไม่หมดอายุ)
 *  ผู้ใช้เดิมทุกคนถูกตั้งเป็น 'pro' (โควตาเท่าค่าเริ่มต้นเดิม 20/5) ผู้สมัครใหม่ได้ 'free'
 */
export class Plans1700001500000 implements MigrationInterface {
  name = 'Plans1700001500000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "plans" (
        "id" varchar(32) PRIMARY KEY,
        "name" varchar(64) NOT NULL,
        "sort_order" integer NOT NULL DEFAULT 0,
        "device_quota" integer NOT NULL CHECK ("device_quota" >= 0),
        "site_quota" integer NOT NULL CHECK ("site_quota" >= 0),
        "camera_quota" integer NOT NULL CHECK ("camera_quota" >= 0),
        "recording_enabled" boolean NOT NULL DEFAULT false,
        "notification_types" text[] NOT NULL DEFAULT '{}',
        "retention_days" integer NULL CHECK ("retention_days" IS NULL OR "retention_days" >= 1)
      )`);
    await q.query(`
      INSERT INTO "plans" ("id","name","sort_order","device_quota","site_quota","camera_quota","recording_enabled","notification_types","retention_days") VALUES
        ('free','Free',1,5,1,1,false,'{telegram}',7),
        ('pro','Pro',2,20,5,4,true,'{telegram,line,email}',90),
        ('business','Business',3,200,50,32,true,'{telegram,line,email}',365)`);

    await q.query(`ALTER TABLE "users" ADD COLUMN "plan_id" varchar(32) NOT NULL DEFAULT 'free' REFERENCES "plans"("id")`);
    await q.query(`ALTER TABLE "users" ADD COLUMN "plan_expires_at" timestamptz NULL`);
    await q.query(`UPDATE "users" SET "plan_id" = 'pro'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" DROP COLUMN "plan_expires_at"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN "plan_id"`);
    await q.query(`DROP TABLE IF EXISTS "plans"`);
  }
}
