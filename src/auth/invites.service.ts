import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { User } from '../users/entities/user.entity';

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

export interface InviteView {
  id: string;
  email: string | null;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

/** ใบเชิญสมัครสมาชิก: เก็บเฉพาะ hash ของรหัส รหัสจริงเห็นครั้งเดียวตอนสร้าง */
@Injectable()
export class InvitesService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  async create(createdBy: string, email: string | undefined, days: number) {
    const code = randomBytes(9).toString('base64url'); // 12 ตัวอักษร
    const rows: { id: string; expires_at: Date }[] = await this.users.query(
      `INSERT INTO invites (code_hash, email, created_by, expires_at)
       VALUES ($1, $2, $3, now() + ($4 || ' days')::interval) RETURNING id, expires_at`,
      [sha256(code), email?.trim().toLowerCase() ?? null, createdBy, String(days)],
    );
    return { id: rows[0].id, code, email: email ?? null, expires_at: rows[0].expires_at };
  }

  list(): Promise<InviteView[]> {
    return this.users.query(
      `SELECT id, email, expires_at, used_at, created_at FROM invites ORDER BY created_at DESC LIMIT 100`,
    );
  }

  async remove(id: string): Promise<void> {
    const r = await this.users.query(`DELETE FROM invites WHERE id = $1 AND used_at IS NULL RETURNING id`, [id]);
    const deleted = Array.isArray(r) && Array.isArray(r[0]) ? r[0] : r;
    if (!deleted.length) throw new NotFoundException('ไม่พบใบเชิญที่ยังไม่ถูกใช้');
  }

  /**
   * ใช้ใบเชิญ (atomic: ใช้ซ้ำไม่ได้) คืน id ของใบเชิญ เพื่อย้อนคืนได้ถ้าสร้างผู้ใช้ไม่สำเร็จ
   * error ข้อความเดียวกันทุกกรณี ไม่บอกว่ารหัสผิด/หมดอายุ/ถูกใช้แล้ว
   */
  async consume(code: string | undefined, email: string): Promise<string> {
    const fail = () => new BadRequestException('รหัสเชิญไม่ถูกต้องหรือหมดอายุ');
    if (!code) throw fail();
    const rows = await this.users.query(
      `UPDATE invites SET used_at = now()
        WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now()
          AND (email IS NULL OR email = $2)
        RETURNING id`,
      [sha256(code.trim()), email.trim().toLowerCase()],
    );
    const updated = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : rows;
    if (!updated.length) throw fail();
    return updated[0].id;
  }

  async markUsed(inviteId: string, userId: string): Promise<void> {
    await this.users.query(`UPDATE invites SET used_by = $2 WHERE id = $1`, [inviteId, userId]);
  }

  async release(inviteId: string): Promise<void> {
    await this.users.query(`UPDATE invites SET used_at = NULL WHERE id = $1`, [inviteId]);
  }
}
