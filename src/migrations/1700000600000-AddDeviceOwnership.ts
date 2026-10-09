import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * เพิ่มความเป็นเจ้าของ (owner) ให้ devices และ rules
 * - ข้อมูลเดิมที่ยังไม่มีเจ้าของ จะถูกโอนให้ admin คนแรกของระบบ (บัญชีที่สมัครเป็นคนแรก)
 * - ลบ user แล้วอุปกรณ์ไม่หาย: owner_id กลายเป็น NULL (เข้าถึงได้เฉพาะ admin)
 */
export class AddDeviceOwnership1700000600000 implements MigrationInterface {
  name = 'AddDeviceOwnership1700000600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "devices" ADD COLUMN "owner_id" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`CREATE INDEX "IDX_devices_owner_id" ON "devices" ("owner_id")`);
    await queryRunner.query(`
      UPDATE "devices"
      SET "owner_id" = (SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "created_at" ASC LIMIT 1)
      WHERE "owner_id" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "rules" ADD COLUMN "owner_id" uuid NULL REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`CREATE INDEX "IDX_rules_owner_id" ON "rules" ("owner_id")`);
    await queryRunner.query(`
      UPDATE "rules" r
      SET "owner_id" = d."owner_id"
      FROM "devices" d
      WHERE d."id" = r."target_device_id" AND r."owner_id" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_rules_owner_id"`);
    await queryRunner.query(`ALTER TABLE "rules" DROP COLUMN IF EXISTS "owner_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_devices_owner_id"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "owner_id"`);
  }
}
