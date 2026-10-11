import { MigrationInterface, QueryRunner } from 'typeorm';

/** ยืนยันอีเมลตอนสมัคร: users.email_verified_at + ตารางรหัสยืนยัน (ผู้ใช้เดิมถือว่ายืนยันแล้ว) */
export class EmailVerification1700001400000 implements MigrationInterface {
  name = 'EmailVerification1700001400000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamptz NULL`);
    await q.query(`UPDATE "users" SET "email_verified_at" = now()`);
    await q.query(`
      CREATE TABLE "email_verifications" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "code_hash" varchar(64) NOT NULL,
        "attempts" smallint NOT NULL DEFAULT 0,
        "expires_at" timestamptz NOT NULL,
        "used_at" timestamptz NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX "idx_email_verifications_user" ON "email_verifications" ("user_id", "created_at" DESC)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "email_verifications"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN "email_verified_at"`);
  }
}
