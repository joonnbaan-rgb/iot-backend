import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRules1700000200000 implements MigrationInterface {
  name = 'CreateRules1700000200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "rules" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "name" varchar,
        "sensor_device_id" uuid NOT NULL REFERENCES "devices"("id") ON DELETE CASCADE,
        "operator" varchar NOT NULL,
        "threshold" double precision NOT NULL,
        "target_device_id" uuid NOT NULL REFERENCES "devices"("id") ON DELETE CASCADE,
        "action" varchar NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "cooldown_seconds" integer NOT NULL DEFAULT 60,
        "last_triggered_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_rules_sensor_device_id" ON "rules" ("sensor_device_id")`);

    await queryRunner.query(`
      CREATE TABLE "rule_execution_logs" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "rule_id" uuid NOT NULL REFERENCES "rules"("id") ON DELETE CASCADE,
        "sensor_value" double precision NOT NULL,
        "triggered" boolean NOT NULL,
        "command_id" uuid,
        "skipped_reason" varchar,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_rule_execution_logs_rule_id" ON "rule_execution_logs" ("rule_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "rule_execution_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "rules"`);
  }
}
