import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1700000000000 implements MigrationInterface {
  name = 'InitSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS timescaledb`);

    await queryRunner.query(`
      CREATE TYPE "users_role_enum" AS ENUM ('admin', 'user')
    `);
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "email" varchar NOT NULL UNIQUE,
        "password_hash" varchar NOT NULL,
        "role" "users_role_enum" NOT NULL DEFAULT 'user',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "devices_type_enum" AS ENUM ('sensor', 'camera', 'actuator')
    `);
    await queryRunner.query(`
      CREATE TYPE "devices_status_enum" AS ENUM ('online', 'offline')
    `);
    await queryRunner.query(`
      CREATE TABLE "devices" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "name" varchar NOT NULL,
        "type" "devices_type_enum" NOT NULL,
        "status" "devices_status_enum" NOT NULL DEFAULT 'offline',
        "location" varchar,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "sensor_data" (
        "id" uuid DEFAULT uuid_generate_v4(),
        "device_id" uuid NOT NULL,
        "value" double precision NOT NULL,
        "unit" varchar,
        "recorded_at" TIMESTAMPTZ NOT NULL,
        PRIMARY KEY ("id", "recorded_at")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_sensor_data_device_id" ON "sensor_data" ("device_id")`);
    // แปลง sensor_data เป็น TimescaleDB hypertable แบ่ง chunk ตามเวลา
    await queryRunner.query(`
      SELECT create_hypertable('sensor_data', 'recorded_at', if_not_exists => TRUE)
    `);

    await queryRunner.query(`
      CREATE TYPE "device_commands_status_enum" AS ENUM ('pending', 'success', 'failed', 'timeout')
    `);
    await queryRunner.query(`
      CREATE TABLE "device_commands" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "device_id" uuid NOT NULL,
        "action" varchar NOT NULL,
        "status" "device_commands_status_enum" NOT NULL DEFAULT 'pending',
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_device_commands_device_id" ON "device_commands" ("device_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "device_commands"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "device_commands_status_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sensor_data"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "devices"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "devices_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "devices_type_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "users_role_enum"`);
  }
}
