import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationLogs1700000500000 implements MigrationInterface {
  name = 'CreateNotificationLogs1700000500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notification_logs" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "channel" varchar NOT NULL,
        "event_type" varchar NOT NULL,
        "message" text NOT NULL,
        "status" varchar NOT NULL,
        "error" varchar,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_notification_logs_created_at" ON "notification_logs" ("created_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_logs"`);
  }
}
