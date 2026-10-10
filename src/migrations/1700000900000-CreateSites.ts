import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * เฟส D: Site (บ้าน/ฟาร์ม/โรงงาน) + สมาชิกพร้อม role ต่อ site
 * ผู้ใช้เดิมทุกคนได้ "ไซต์ส่วนตัว" 1 แห่ง และอุปกรณ์เดิมย้ายเข้าไซต์ส่วนตัวของเจ้าของอัตโนมัติ
 */
export class CreateSites1700000900000 implements MigrationInterface {
  name = 'CreateSites1700000900000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "sites" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "name" varchar(128) NOT NULL,
        "kind" varchar(16) NOT NULL DEFAULT 'home' CHECK ("kind" IN ('home','farm','factory')),
        "is_personal" boolean NOT NULL DEFAULT false,
        "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX "uq_sites_personal" ON "sites" ("created_by") WHERE "is_personal"`);
    await q.query(`
      CREATE TABLE "site_members" (
        "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "role" varchar(16) NOT NULL CHECK ("role" IN ('admin','operator','viewer')),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY ("site_id", "user_id")
      )`);
    await q.query(`CREATE INDEX "idx_site_members_user" ON "site_members" ("user_id")`);
    await q.query(`ALTER TABLE "devices" ADD COLUMN "site_id" uuid NULL REFERENCES "sites"("id") ON DELETE SET NULL`);
    await q.query(`CREATE INDEX "idx_devices_site" ON "devices" ("site_id")`);

    // backfill: ไซต์ส่วนตัวให้ผู้ใช้ทุกคน
    await q.query(`
      INSERT INTO "sites" ("name","kind","is_personal","created_by")
      SELECT 'ไซต์ของฉัน','home',true,u."id" FROM "users" u`);
    await q.query(`
      INSERT INTO "site_members" ("site_id","user_id","role")
      SELECT s."id", s."created_by", 'admin' FROM "sites" s WHERE s."is_personal"`);
    await q.query(`
      UPDATE "devices" d SET "site_id" = s."id"
        FROM "sites" s WHERE s."is_personal" AND s."created_by" = d."owner_id"`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "devices" DROP COLUMN "site_id"`);
    await q.query(`DROP TABLE "site_members"`);
    await q.query(`DROP TABLE "sites"`);
  }
}
