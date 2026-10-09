import { MigrationInterface, QueryRunner } from 'typeorm';

/** เก็บข้อมูลการเชื่อมต่อของอุปกรณ์จริงที่จับคู่ได้ (เช่น Tasmota ที่ IP นี้) เฟสถัดไปใช้สั่งงานอุปกรณ์ */
export class AddDeviceConnection1700000800000 implements MigrationInterface {
  name = 'AddDeviceConnection1700000800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "devices" ADD COLUMN "connection" jsonb NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN "connection"`);
  }
}
