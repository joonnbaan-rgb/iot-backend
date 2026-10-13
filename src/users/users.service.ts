import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { QuotaService } from './quota.service';
import { PlansService } from '../plans/plans.service';

type SafeUser = Omit<User, 'password_hash'>;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly quota: QuotaService,
    private readonly plans: PlansService,
  ) {}

  /** รายชื่อผู้ใช้ทั้งหมดพร้อมจำนวนอุปกรณ์/ไซต์ที่ใช้อยู่ (สำหรับหน้าจัดการผู้ใช้ของ admin) */
  async findAll() {
    const rows: (User & { device_count: number; site_count: number; shared_count: number })[] =
      await this.userRepository.query(
        `SELECT u.id, u.email, u.role, u.status, u.device_quota, u.site_quota, u.plan_id, u.plan_expires_at, u.last_login_at, u.created_at,
                (SELECT COUNT(*)::int FROM devices d WHERE d.owner_id = u.id) AS device_count,
                (SELECT COUNT(*)::int FROM sites s WHERE s.created_by = u.id AND NOT s.is_personal) AS site_count,
                (SELECT COUNT(*)::int FROM device_shares x WHERE x.owner_id = u.id) AS shared_count
           FROM users u ORDER BY u.created_at DESC`,
      );
    return rows;
  }

  async findOneSafe(userId: string): Promise<SafeUser> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(`ไม่พบผู้ใช้ id: ${userId}`);
    const { password_hash, ...safe } = user;
    return safe;
  }

  async updateRole(userId: string, role: UserRole): Promise<SafeUser> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`ไม่พบผู้ใช้ id: ${userId}`);
    }
    user.role = role;
    await this.userRepository.save(user);
    const { password_hash, ...safe } = user;
    return safe;
  }

  /** admin ปรับโควตา/ระงับบัญชี (ระงับตัวเองไม่ได้ และระงับ admin คนสุดท้ายไม่ได้) */
  async update(actorId: string, userId: string, dto: UpdateUserDto): Promise<SafeUser> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(`ไม่พบผู้ใช้ id: ${userId}`);
    if (dto.status === 'suspended') {
      if (userId === actorId) throw new BadRequestException('ระงับบัญชีของตัวเองไม่ได้');
      if (user.role === UserRole.ADMIN) {
        const admins = await this.userRepository.count({ where: { role: UserRole.ADMIN, status: 'active' } });
        if (admins <= 1) throw new BadRequestException('ต้องมี admin ที่ใช้งานได้อย่างน้อย 1 คน');
      }
    }
    if (dto.device_quota !== undefined) user.device_quota = dto.device_quota;
    if (dto.site_quota !== undefined) user.site_quota = dto.site_quota;
    if (dto.plan_id !== undefined) {
      if (!(await this.plans.exists(dto.plan_id))) throw new BadRequestException('ไม่พบแพ็กเกจที่ระบุ');
      user.plan_id = dto.plan_id;
    }
    if (dto.plan_expires_at !== undefined) user.plan_expires_at = dto.plan_expires_at ? new Date(dto.plan_expires_at) : null;
    if (dto.status !== undefined) user.status = dto.status;
    await this.userRepository.save(user);
    if (dto.status === 'suspended') {
      // ตัด refresh token ทั้งหมด: access token เดิมหมดอายุเองภายใน JWT_EXPIRES_IN แล้วจะเข้าไม่ได้อีก
      await this.userRepository.query(
        `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
      );
    }
    const { password_hash, ...safe } = user;
    return safe;
  }

  /** อุปกรณ์ที่ผู้ใช้คนนี้เป็นเจ้าของ (admin ใช้ดู/จัดการแทน) */
  listDevicesOf(userId: string) {
    return this.userRepository.query(
      `SELECT id, name, type, status, location, site_id, created_at, last_seen_at
         FROM devices WHERE owner_id = $1 ORDER BY created_at ASC`,
      [userId],
    );
  }

  usage(userId: string) {
    return this.quota.usage(userId);
  }
}
