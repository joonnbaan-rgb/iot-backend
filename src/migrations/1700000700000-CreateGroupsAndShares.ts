import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * กลุ่มอุปกรณ์ + การแชร์อุปกรณ์ให้บัญชีอื่น
 *  - device_groups / device_group_members: กลุ่มเป็นของผู้ใช้คนเดียว (owner) อุปกรณ์อยู่ได้หลายกลุ่ม
 *  - device_shares: 1 แถว = 1 การแชร์จาก owner ไปหา shared_with
 *      device_id ระบุ          -> แชร์อุปกรณ์เดียว
 *      group_id ระบุ           -> แชร์ทั้งกลุ่ม (อุปกรณ์ที่เพิ่มเข้ากลุ่มทีหลังก็ได้สิทธิ์ด้วย)
 *      ทั้งสองเป็น NULL        -> แชร์ "ทุกอุปกรณ์ของฉัน" (รวมอุปกรณ์ที่เพิ่มทีหลัง)
 */
export class CreateGroupsAndShares1700000700000 implements MigrationInterface {
  name = 'CreateGroupsAndShares1700000700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "device_groups" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "name" varchar NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_device_groups_owner_id" ON "device_groups" ("owner_id")`);

    await queryRunner.query(`
      CREATE TABLE "device_group_members" (
        "group_id" uuid NOT NULL REFERENCES "device_groups"("id") ON DELETE CASCADE,
        "device_id" uuid NOT NULL REFERENCES "devices"("id") ON DELETE CASCADE,
        PRIMARY KEY ("group_id", "device_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_device_group_members_device_id" ON "device_group_members" ("device_id")`);

    await queryRunner.query(`
      CREATE TABLE "device_shares" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "shared_with_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "device_id" uuid NULL REFERENCES "devices"("id") ON DELETE CASCADE,
        "group_id" uuid NULL REFERENCES "device_groups"("id") ON DELETE CASCADE,
        "permission" varchar NOT NULL DEFAULT 'view' CHECK ("permission" IN ('view','control')),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CHECK (NOT ("device_id" IS NOT NULL AND "group_id" IS NOT NULL)),
        CHECK ("owner_id" <> "shared_with_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_device_shares_shared_with" ON "device_shares" ("shared_with_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_device_shares_owner" ON "device_shares" ("owner_id")`);
    // กันแชร์ซ้ำเป้าหมายเดียวกันให้คนเดียวกัน (NULL ถูกแทนด้วย uuid ศูนย์เพื่อให้ unique ทำงาน)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_device_shares_target" ON "device_shares" (
        "owner_id", "shared_with_id",
        COALESCE("device_id", '00000000-0000-0000-0000-000000000000'::uuid),
        COALESCE("group_id", '00000000-0000-0000-0000-000000000000'::uuid)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "device_shares"`);
    await queryRunner.query(`DROP TABLE "device_group_members"`);
    await queryRunner.query(`DROP TABLE "device_groups"`);
  }
}
