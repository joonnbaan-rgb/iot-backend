import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLastSeenToDevices1700000100000 implements MigrationInterface {
  name = 'AddLastSeenToDevices1700000100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "devices" ADD COLUMN "last_seen_at" TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "devices" DROP COLUMN "last_seen_at"
    `);
  }
}
