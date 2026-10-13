import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomInt } from 'crypto';
import { User } from '../users/entities/user.entity';
import { PlansService } from '../plans/plans.service';
import { UpdateReferralSettingsDto } from './dto/referral-settings.dto';

const SETTINGS_KEY = 'referral';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface ReferralSettings {
  enabled: boolean;
  inviter_days: number;
  invitee_days: number;
  reward_plan: string;
  max_rewards_per_user: number; // 0 = ไม่จำกัด
}

const DEFAULTS: ReferralSettings = {
  enabled: true,
  inviter_days: 30,
  invitee_days: 14,
  reward_plan: 'pro',
  max_rewards_per_user: 12,
};

/** ระบบแนะนำสมาชิก: ผู้ใช้มีรหัสแนะนำ ผู้สมัครใหม่ใส่รหัส -> ทั้งสองฝ่ายได้วันโปรโมชัน */
@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly plans: PlansService,
  ) {}

  async getSettings(): Promise<ReferralSettings> {
    const rows: { value: Partial<ReferralSettings> }[] = await this.users.query(
      `SELECT value FROM app_settings WHERE key = $1`,
      [SETTINGS_KEY],
    );
    return { ...DEFAULTS, ...(rows[0]?.value ?? {}) };
  }

  async updateSettings(dto: UpdateReferralSettingsDto): Promise<ReferralSettings> {
    const cur = await this.getSettings();
    const next: ReferralSettings = {
      enabled: dto.enabled ?? cur.enabled,
      inviter_days: dto.inviter_days ?? cur.inviter_days,
      invitee_days: dto.invitee_days ?? cur.invitee_days,
      reward_plan: dto.reward_plan ?? cur.reward_plan,
      max_rewards_per_user: dto.max_rewards_per_user ?? cur.max_rewards_per_user,
    };
    if (!(await this.plans.exists(next.reward_plan))) throw new BadRequestException('ไม่พบแพ็กเกจรางวัลที่ระบุ');
    await this.users.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [SETTINGS_KEY, JSON.stringify(next)],
    );
    return next;
  }

  /** สร้างรหัสแนะนำใหม่ที่ไม่ซ้ำ (ใช้ตอนสมัคร) */
  async generateCode(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const code = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
      const taken = await this.users.query(`SELECT 1 FROM users WHERE referral_code = $1`, [code]);
      if (taken.length === 0) return code;
    }
    throw new Error('สร้างรหัสแนะนำไม่สำเร็จ');
  }

  /** หาผู้แนะนำจากรหัส (ต้องเป็นบัญชีที่ใช้งานอยู่) */
  async findInviter(codeRaw: string | undefined | null): Promise<{ id: string } | null> {
    const code = (codeRaw ?? '').trim().toUpperCase();
    if (!code) return null;
    const rows: { id: string }[] = await this.users.query(
      `SELECT id FROM users WHERE referral_code = $1 AND status = 'active'`,
      [code],
    );
    return rows[0] ?? null;
  }

  /**
   * บันทึกการแนะนำตอนสมัคร; immediate = true จ่ายรางวัลทันที
   * (ถ้าต้องยืนยันอีเมลจะจ่ายหลังยืนยัน เพื่อกันสมัครด้วยอีเมลปลอมเพื่อสะสมวัน)
   */
  async record(inviterId: string, inviteeId: string, immediate: boolean): Promise<void> {
    if (inviterId === inviteeId) return;
    await this.users.query(
      `INSERT INTO referrals (inviter_id, invitee_id) VALUES ($1, $2) ON CONFLICT (invitee_id) DO NOTHING`,
      [inviterId, inviteeId],
    );
    if (immediate) await this.reward(inviteeId);
  }

  /** จ่ายรางวัลของการแนะนำที่ยังค้าง (เรียกซ้ำได้ ปลอดภัย) */
  async reward(inviteeId: string): Promise<void> {
    try {
      const s = await this.getSettings();
      // ล็อกแถวกันจ่ายซ้ำเมื่อมีหลายคำขอพร้อมกัน
      const claimed: { id: string; inviter_id: string }[] = await this.users.query(
        `UPDATE referrals SET rewarded_at = now() WHERE invitee_id = $1 AND rewarded_at IS NULL RETURNING id, inviter_id`,
        [inviteeId],
      );
      const r = claimed[0];
      if (!r) return;
      if (!s.enabled) {
        await this.users.query(`UPDATE referrals SET rewarded_at = NULL WHERE id = $1`, [r.id]);
        return; // ปิดโปรโมชันอยู่: เก็บไว้ ยังไม่จ่าย (จ่ายเมื่อเปิดแล้วมีเหตุให้เรียกใหม่)
      }
      let inviterDays = 0;
      if (s.max_rewards_per_user === 0 || (await this.rewardedCount(r.inviter_id)) <= s.max_rewards_per_user) {
        inviterDays = await this.plans.grantDays(r.inviter_id, s.inviter_days, s.reward_plan);
      }
      const inviteeDays = await this.plans.grantDays(inviteeId, s.invitee_days, s.reward_plan);
      await this.users.query(`UPDATE referrals SET inviter_days = $2, invitee_days = $3 WHERE id = $1`, [r.id, inviterDays, inviteeDays]);
    } catch (err) {
      this.logger.error(`จ่ายรางวัลแนะนำสมาชิกล้มเหลว (invitee ${inviteeId}): ${(err as Error).message}`);
    }
  }

  private async rewardedCount(inviterId: string): Promise<number> {
    const [{ n }] = await this.users.query(
      `SELECT COUNT(*)::int AS n FROM referrals WHERE inviter_id = $1 AND rewarded_at IS NOT NULL`,
      [inviterId],
    );
    return n;
  }

  /** ข้อมูลการแนะนำของฉัน + รายละเอียดโปรโมชัน */
  async me(userId: string) {
    let [row] = await this.users.query(`SELECT referral_code FROM users WHERE id = $1`, [userId]);
    if (row && !row.referral_code) {
      const code = await this.generateCode();
      await this.users.query(`UPDATE users SET referral_code = $2 WHERE id = $1 AND referral_code IS NULL`, [userId, code]);
      [row] = await this.users.query(`SELECT referral_code FROM users WHERE id = $1`, [userId]);
    }
    const [stat] = await this.users.query(
      `SELECT COUNT(*)::int AS invited,
              COUNT(*) FILTER (WHERE rewarded_at IS NOT NULL)::int AS rewarded,
              COALESCE(SUM(inviter_days), 0)::int AS days_earned
         FROM referrals WHERE inviter_id = $1`,
      [userId],
    );
    const [mine] = await this.users.query(`SELECT invitee_days FROM referrals WHERE invitee_id = $1`, [userId]);
    const s = await this.getSettings();
    return {
      code: row?.referral_code ?? null,
      invited_count: stat.invited,
      rewarded_count: stat.rewarded,
      days_earned: stat.days_earned,
      bonus_days_received: mine?.invitee_days ?? 0, // วันที่เราได้ตอนสมัครด้วยรหัสของคนอื่น
      promo: {
        enabled: s.enabled,
        inviter_days: s.inviter_days,
        invitee_days: s.invitee_days,
        reward_plan: s.reward_plan,
        max_rewards_per_user: s.max_rewards_per_user,
      },
    };
  }

  /** รายการแนะนำทั้งหมด (admin) */
  list(limit = 200) {
    return this.users.query(
      `SELECT r.id, r.created_at, r.rewarded_at, r.inviter_days, r.invitee_days,
              a.email AS inviter_email, b.email AS invitee_email
         FROM referrals r
         JOIN users a ON a.id = r.inviter_id
         JOIN users b ON b.id = r.invitee_id
        ORDER BY r.created_at DESC LIMIT $1`,
      [Math.min(limit, 500)],
    );
  }
}
