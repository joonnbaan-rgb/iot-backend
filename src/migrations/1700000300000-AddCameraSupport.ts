import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCameraSupport1700000300000 implements MigrationInterface {
  name = 'AddCameraSupport1700000300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "devices" ADD COLUMN "rtsp_url" varchar NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "camera_recordings" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "device_id" uuid NOT NULL REFERENCES "devices"("id") ON DELETE CASCADE,
        "object_key" varchar NOT NULL,
        "file_size_bytes" bigint,
        "recorded_at" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_camera_recordings_device_id" ON "camera_recordings" ("device_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "camera_recordings"`);
    await queryRunner.query(`ALTER TABLE "devices" DROP COLUMN IF EXISTS "rtsp_url"`);
  }
}
