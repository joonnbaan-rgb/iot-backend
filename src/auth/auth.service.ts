import {
  ConflictException,
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
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

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
  ) {}

  async register(dto: RegisterDto): Promise<Omit<User, 'password_hash'>> {
    const existing = await this.userRepository.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('อีเมลนี้ถูกใช้สมัครแล้ว');
    }

    const saltRounds = parseInt(this.configService.get<string>('BCRYPT_SALT_ROUNDS', '10'), 10);
    const password_hash = await bcrypt.hash(dto.password, saltRounds);

    // ผู้ใช้คนแรกของระบบถูกตั้งเป็น admin อัตโนมัติ (bootstrap) คนถัดไปเป็น user ธรรมดา
    const userCount = await this.userRepository.count();
    const role = userCount === 0 ? UserRole.ADMIN : UserRole.USER;

    const user = this.userRepository.create({ email: dto.email, password_hash, role });
    await this.userRepository.save(user);
    await ensurePersonalSite(this.userRepository.manager, user.id);

    const { password_hash: _omit, ...safeUser } = user;
    return safeUser;
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
