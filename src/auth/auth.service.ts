import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User, UserRole } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { ensurePersonalSite } from '../sites/personal-site';
import { InvitesService } from './invites.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { EmailService } from '../notifications/email.service';
import { Logger } from '@nestjs/common';
import { QuotaService } from '../users/quota.service';
import { ReferralsService } from '../referrals/referrals.service';

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly invites: InvitesService,
    private readonly email: EmailService,
    private readonly quota: QuotaService,
    private readonly referrals: ReferralsService,
  ) {}

  private readonly logger = new Logger(AuthService.name);

  /** ค่าตั้งค่าสาธารณะที่แอปใช้ปรับหน้าสมัคร/ลืมรหัสผ่าน (ก่อน login) */
  async publicConfig() {
    return {
      registration_mode: this.configService.get<string>('REGISTRATION_MODE', 'open'),
      password_reset_available: this.email.isConfigured(),
      email_verification_required: this.verificationRequired(),
      referral_enabled: (await this.referrals.getSettings()).enabled,
    };
  }

  /** ต้องยืนยันอีเมลก่อนใช้งานหรือไม่ (REQUIRE_EMAIL_VERIFICATION=true และตั้งค่าอีเมลแล้ว; ถ้ายังไม่ตั้งอีเมลจะข้ามเพื่อไม่ให้ล็อกผู้ใช้ทั้งหมด) */
  private verificationRequired(): boolean {
    const want = this.configService.get<string>('REQUIRE_EMAIL_VERIFICATION', 'false') === 'true';
    if (!want) return false;
    if (this.email.isConfigured()) return true;
    // ไม่มีอีเมล: โหมดพัฒนายังบังคับยืนยัน (รหัสพิมพ์ลงล็อก) แต่ production ข้ามเพื่อไม่ให้ผู้ใช้ทั้งหมดเข้าไม่ได้
    if (this.configService.get<string>('NODE_ENV') !== 'production') return true;
    this.logger.warn('REQUIRE_EMAIL_VERIFICATION=true แต่ยังไม่ได้ตั้ง RESEND_API_KEY/EMAIL_FROM — ข้ามการยืนยันอีเมล');
    return false;
  }

  private async sendVerificationCode(user: User): Promise<void> {
    const recent = await this.userRepository.query(
      `SELECT 1 FROM email_verifications WHERE user_id = $1 AND created_at > now() - interval '60 seconds'`,
      [user.id],
    );
    if (recent.length > 0) return;
    const code = String(crypto.randomInt(0, 100_000_000)).padStart(8, '0');
    await this.userRepository.query(
      `INSERT INTO email_verifications (user_id, code_hash, expires_at) VALUES ($1,$2,now() + interval '30 minutes')`,
      [user.id, this.hashToken(code)],
    );
    if (!this.email.isConfigured()) {
      this.logger.warn(`[dev] ยังไม่ตั้งค่าอีเมล — รหัสยืนยันของ ${user.email} คือ ${code}`);
      return;
    }
    await this.email
      .send(user.email, 'ยืนยันอีเมลของคุณ', `รหัสยืนยันอีเมลของคุณคือ ${code}\nใช้ได้ 30 นาที`)
      .catch((e) => this.logger.warn(`ส่งอีเมลยืนยันไม่สำเร็จ: ${(e as Error).message}`));
  }

  async resendVerification(emailRaw: string): Promise<void> {
    const user = await this.userRepository
      .createQueryBuilder('u')
      .where('LOWER(u.email) = LOWER(:e)', { e: emailRaw.trim() })
      .getOne();
    // ตอบเหมือนกันเสมอ ไม่เปิดเผยว่ามีอีเมลนี้หรือไม่
    if (!user || user.email_verified_at || !this.verificationRequired()) return;
    await this.sendVerificationCode(user);
  }

  async verifyEmail(emailRaw: string, code: string): Promise<void> {
    const bad = new BadRequestException('รหัสยืนยันไม่ถูกต้องหรือหมดอายุ');
    const user = await this.userRepository
      .createQueryBuilder('u')
      .where('LOWER(u.email) = LOWER(:e)', { e: emailRaw.trim() })
      .getOne();
    if (!user) throw bad;
    if (user.email_verified_at) return;
    const [row] = await this.userRepository.query(
      `SELECT id, code_hash, attempts FROM email_verifications
        WHERE user_id = $1 AND used_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1`,
      [user.id],
    );
    if (!row || row.attempts >= 5) throw bad;
    await this.userRepository.query(`UPDATE email_verifications SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
    const a = Buffer.from(row.code_hash);
    const b = Buffer.from(this.hashToken(code));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw bad;
    await this.userRepository.query(`UPDATE email_verifications SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [user.id]);
    await this.userRepository.update(user.id, { email_verified_at: new Date() });
    // รับแชร์ที่ค้างหลังยืนยันเท่านั้น กันคนสมัครด้วยอีเมลของคนอื่นแล้วรับแชร์ไป
    await this.claimPendingShares(user.id, user.email);
    await this.referrals.reward(user.id);
  }

  /** ปริมาณการใช้งานเทียบโควตาของผู้ใช้ปัจจุบัน */
  usage(userId: string) {
    return this.quota.usage(userId);
  }

  /** รับแชร์ที่ค้างอยู่ (ผู้อื่นแชร์ให้อีเมลนี้ก่อนสมัคร) */
  private async claimPendingShares(userId: string, email: string): Promise<void> {
    await this.userRepository.query(
      `WITH p AS (DELETE FROM pending_shares WHERE LOWER(email) = LOWER($2) RETURNING owner_id, device_id, group_id, permission)
       INSERT INTO device_shares (owner_id, shared_with_id, device_id, group_id, permission)
       SELECT owner_id, $1, device_id, group_id, permission FROM p WHERE owner_id <> $1
       ON CONFLICT DO NOTHING`,
      [userId, email],
    );
  }

  async forgotPassword(emailRaw: string): Promise<void> {
    // ตอบเหมือนกันเสมอ ไม่บอกว่าอีเมลนี้มีในระบบหรือไม่
    const user = await this.userRepository
      .createQueryBuilder('u')
      .where('LOWER(u.email) = LOWER(:e)', { e: emailRaw.trim() })
      .getOne();
    if (!user || user.status !== 'active') return;
    const recent = await this.userRepository.query(
      `SELECT 1 FROM password_resets WHERE user_id = $1 AND created_at > now() - interval '60 seconds'`,
      [user.id],
    );
    if (recent.length > 0) return;
    const code = String(crypto.randomInt(0, 100_000_000)).padStart(8, '0');
    await this.userRepository.query(
      `INSERT INTO password_resets (user_id, code_hash, expires_at) VALUES ($1,$2,now() + interval '30 minutes')`,
      [user.id, this.hashToken(code)],
    );
    if (this.email.isConfigured()) {
      await this.email
        .send(
          user.email,
          'รหัสรีเซ็ตรหัสผ่าน',
          `รหัสยืนยันของคุณคือ ${code}\nใช้ได้ 30 นาที ถ้าคุณไม่ได้ขอ ให้เพิกเฉยต่ออีเมลนี้`,
        )
        .catch((e) => this.logger.warn(`ส่งอีเมลรีเซ็ตรหัสผ่านไม่สำเร็จ: ${(e as Error).message}`));
    } else if (this.configService.get<string>('NODE_ENV') !== 'production') {
      this.logger.warn(`[dev] ยังไม่ตั้งค่าอีเมล — รหัสรีเซ็ตของ ${user.email} คือ ${code}`);
    }
  }

  async resetPassword(emailRaw: string, code: string, newPassword: string): Promise<void> {
    const bad = new BadRequestException('รหัสยืนยันไม่ถูกต้องหรือหมดอายุ');
    const user = await this.userRepository
      .createQueryBuilder('u')
      .where('LOWER(u.email) = LOWER(:e)', { e: emailRaw.trim() })
      .getOne();
    if (!user) throw bad;
    const [reset] = await this.userRepository.query(
      `SELECT id, code_hash, attempts FROM password_resets
        WHERE user_id = $1 AND used_at IS NULL AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1`,
      [user.id],
    );
    if (!reset || reset.attempts >= 5) throw bad;
    await this.userRepository.query(`UPDATE password_resets SET attempts = attempts + 1 WHERE id = $1`, [reset.id]);
    const a = Buffer.from(reset.code_hash);
    const b = Buffer.from(this.hashToken(code));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw bad;

    const saltRounds = parseInt(this.configService.get<string>('BCRYPT_SALT_ROUNDS', '10'), 10);
    user.password_hash = await bcrypt.hash(newPassword, saltRounds);
    // รับรหัสทางอีเมลได้ = เป็นเจ้าของอีเมลจริง ถือว่ายืนยันแล้ว (ช่วยกรณีมีคนสมัครล่วงหน้าด้วยอีเมลนี้)
    const wasUnverified = !user.email_verified_at;
    if (wasUnverified) user.email_verified_at = new Date();
    await this.userRepository.save(user);
    if (wasUnverified) {
      await this.claimPendingShares(user.id, user.email);
      await this.referrals.reward(user.id);
    }
    await this.userRepository.query(`UPDATE password_resets SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`, [user.id]);
    await this.userRepository.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [user.id]);
  }

  async changePassword(userId: string, current: string, next: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    if (!(await bcrypt.compare(current, user.password_hash))) {
      throw new BadRequestException('รหัสผ่านปัจจุบันไม่ถูกต้อง');
    }
    const saltRounds = parseInt(this.configService.get<string>('BCRYPT_SALT_ROUNDS', '10'), 10);
    user.password_hash = await bcrypt.hash(next, saltRounds);
    await this.userRepository.save(user);
    // ออกจากระบบอุปกรณ์อื่นทั้งหมด (refresh token เดิมใช้ไม่ได้อีก)
    await this.userRepository.query(`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
  }

  async register(dto: RegisterDto): Promise<Omit<User, 'password_hash'> & { verification_required: boolean }> {
    const existing = await this.userRepository.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('อีเมลนี้ถูกใช้สมัครแล้ว');
    }

    // ผู้ใช้คนแรกของระบบเป็น admin อัตโนมัติ (bootstrap) สมัครได้เสมอ
    // คนถัดไป: REGISTRATION_MODE = open (ใครก็สมัครได้, ค่าเริ่มต้นตอนพัฒนา) | invite (ต้องมีรหัสเชิญ) | closed (ปิดรับ)
    const userCount = await this.userRepository.count();
    const mode = this.configService.get<string>('REGISTRATION_MODE', 'open');
    let inviteId: string | null = null;
    // รหัสแนะนำจากสมาชิก (ถ้าระบุแล้วไม่ถูกต้อง แจ้งให้แก้ ไม่ปล่อยผ่านเงียบๆ)
    let inviterId: string | null = null;
    if (dto.referral_code?.trim()) {
      if (!(await this.referrals.getSettings()).enabled) throw new BadRequestException('ขณะนี้ปิดโปรโมชันแนะนำสมาชิก');
      inviterId = (await this.referrals.findInviter(dto.referral_code))?.id ?? null;
      if (!inviterId) throw new BadRequestException('รหัสแนะนำไม่ถูกต้อง');
    }
    if (userCount > 0) {
      if (mode === 'closed') throw new ForbiddenException('ระบบปิดรับสมัครสมาชิก');
      if (mode === 'invite') {
        // โหมดเชิญ: สมัครได้ถ้ามีรหัสเชิญ, มีรหัสแนะนำจากสมาชิก, หรือมีคนแชร์อุปกรณ์ให้อีเมลนี้ไว้แล้ว (ผู้รับแชร์ไม่ต้องรอใบเชิญ)
        const sharedToThem = await this.userRepository.query(
          `SELECT 1 FROM pending_shares WHERE LOWER(email) = LOWER($1) LIMIT 1`,
          [dto.email.trim()],
        );
        if (dto.invite_code?.trim() || (!inviterId && sharedToThem.length === 0)) {
          inviteId = await this.invites.consume(dto.invite_code, dto.email);
        }
      }
    }

    try {
      const saltRounds = parseInt(this.configService.get<string>('BCRYPT_SALT_ROUNDS', '10'), 10);
      const password_hash = await bcrypt.hash(dto.password, saltRounds);
      const role = userCount === 0 ? UserRole.ADMIN : UserRole.USER;

      // ผู้ใช้คนแรก (admin) และผู้ที่สมัครด้วยรหัสเชิญ (ยืนยันตัวตนผ่านใบเชิญแล้ว) ไม่ต้องยืนยันอีเมลซ้ำ
      const needVerify = this.verificationRequired() && userCount > 0 && !inviteId;

      const user = this.userRepository.create({
        email: dto.email,
        password_hash,
        role,
        email_verified_at: needVerify ? null : new Date(),
        referral_code: await this.referrals.generateCode(),
      });
      await this.userRepository.save(user);
      await ensurePersonalSite(this.userRepository.manager, user.id);
      if (!needVerify) await this.claimPendingShares(user.id, user.email);
      if (inviteId) await this.invites.markUsed(inviteId, user.id);
      if (inviterId) await this.referrals.record(inviterId, user.id, !needVerify);
      if (needVerify) await this.sendVerificationCode(user);

      const { password_hash: _omit, ...safeUser } = user;
      return { ...safeUser, verification_required: needVerify };
    } catch (err) {
      if (inviteId) await this.invites.release(inviteId).catch(() => undefined);
      throw err;
    }
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.userRepository.findOne({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }
    const passwordMatches = await bcrypt.compare(dto.password, user.password_hash);
    if (!passwordMatches) {
      throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }
    if (user.status === 'suspended') {
      throw new ForbiddenException('บัญชีนี้ถูกระงับ กรุณาติดต่อผู้ดูแลระบบ');
    }
    if (!user.email_verified_at && this.verificationRequired()) {
      throw new ForbiddenException({ message: 'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ', code: 'EMAIL_NOT_VERIFIED' });
    }
    await this.userRepository.update(user.id, { last_login_at: new Date() });

    return this.issueTokens(user);
  }

  /**
   * รับ refresh token เดิม -> ตรวจสอบ -> revoke ตัวเดิมทิ้ง -> ออก access+refresh token ชุดใหม่ (rotation)
   * ป้องกันการใช้ refresh token ตัวเดิมซ้ำได้ตลอดไปถ้าหลุดไปอยู่ในมือคนอื่น
   */
  async refresh(refreshTokenPlain: string): Promise<AuthTokens> {
    const tokenHash = this.hashToken(refreshTokenPlain);
    const stored = await this.refreshTokenRepository.findOne({ where: { token_hash: tokenHash } });

    if (!stored || stored.revoked_at || stored.expires_at.getTime() < Date.now()) {
      throw new UnauthorizedException('refresh token ไม่ถูกต้อง หมดอายุ หรือถูกใช้ไปแล้ว');
    }

    stored.revoked_at = new Date();
    await this.refreshTokenRepository.save(stored);

    const user = await this.userRepository.findOne({ where: { id: stored.user_id } });
    if (!user) {
      throw new UnauthorizedException('ไม่พบผู้ใช้ของ token นี้แล้ว');
    }
    if (user.status === 'suspended') {
      throw new UnauthorizedException('บัญชีนี้ถูกระงับ');
    }

    return this.issueTokens(user);
  }

  async logout(refreshTokenPlain: string): Promise<void> {
    const tokenHash = this.hashToken(refreshTokenPlain);
    const stored = await this.refreshTokenRepository.findOne({ where: { token_hash: tokenHash } });
    if (stored && !stored.revoked_at) {
      stored.revoked_at = new Date();
      await this.refreshTokenRepository.save(stored);
    }
    // ไม่ throw error แม้ token จะไม่พบ/revoke ไปแล้ว เพราะผลลัพธ์ที่ผู้ใช้ต้องการ (ออกจากระบบ) สำเร็จอยู่ดี
  }

  /**
   * ลบ refresh token ที่หมดอายุไปแล้วทิ้งจากตาราง กันตารางบวม (เรียกจาก cron แยกได้ถ้าต้องการ)
   */
  async pruneExpiredTokens(): Promise<void> {
    await this.refreshTokenRepository.delete({ expires_at: LessThan(new Date()) });
  }

  private async issueTokens(user: User): Promise<AuthTokens> {
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '15m');
    const access_token = this.jwtService.sign(
      { sub: user.id, email: user.email, role: user.role },
      { secret: this.configService.get<string>('JWT_SECRET'), expiresIn },
    );

    const refreshTokenPlain = crypto.randomBytes(48).toString('hex');
    const refreshDays = parseInt(this.configService.get<string>('JWT_REFRESH_EXPIRES_IN_DAYS', '7'), 10);
    const expires_at = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);

    const refreshTokenRecord = this.refreshTokenRepository.create({
      user_id: user.id,
      token_hash: this.hashToken(refreshTokenPlain),
      expires_at,
    });
    await this.refreshTokenRepository.save(refreshTokenRecord);

    return { access_token, refresh_token: refreshTokenPlain, expires_in: expiresIn };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
