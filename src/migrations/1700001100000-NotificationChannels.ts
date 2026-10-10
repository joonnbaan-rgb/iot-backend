import { MigrationInterface, QueryRunner } from 'typeorm';

/** เฟส F: ช่องทางแจ้งเตือนรายผู้ใช้ (Telegram/LINE/Email) + การตั้งค่า (เหตุการณ์, ช่วงเวลาเงียบ) + ผูก log กับผู้ใช้ */
export class NotificationChannels1700001100000 implements MigrationInterface {
  name = 'NotificationChannels1700001100000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "notification_channels" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "type" varchar(16) NOT NULL CHECK ("type" IN ('telegram','line','email')),
        "target" varchar(255) NOT NULL,
        "label" varchar(128) NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("user_id", "type", "target")
      )`);
    await q.query(`
      CREATE TABLE "notification_settings" (
        "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
        "events" text[] NOT NULL DEFAULT ARRAY['device_offline','rule_triggered','command_timeout'],
        "quiet_start" smallint NULL,
        "quiet_end" smallint NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`ALTER TABLE "notification_logs" ADD COLUMN "user_id" uuid NULL`);
    await q.query(`CREATE INDEX "idx_notification_logs_user" ON "notification_logs" ("user_id", "created_at" DESC)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "idx_notification_logs_user"`);
    await q.query(`ALTER TABLE "notification_logs" DROP COLUMN "user_id"`);
    await q.query(`DROP TABLE "notification_settings"`);
    await q.query(`DROP TABLE "notification_channels"`);
  }
}
