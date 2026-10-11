import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';

export interface UsageView {
  devices: { used: number; limit: number | null };
  sites: { used: number; limit: number | null };
}

/** โควตาอุปกรณ์/ไซต์ต่อผู้ใช้ (admin ไม่จำกัด; limit = null) */
@Injectable()
export class QuotaService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  private defaultOf(key: 'DEFAULT_DEVICE_QUOTA' | 'DEFAULT_SITE_QUOTA', fallback: number): number {
    const n = parseInt(this.config.get<string>(key, String(fallback)), 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }

  async usage(userId: string): Promise<UsageView> {
    const user = await this.users.findOne({ where: { id: userId } });
    const [row] = await this.users.query(
      `SELECT (SELECT COUNT(*)::int FROM devices WHERE owner_id = $1) AS devices,
              (SELECT COUNT(*)::int FROM sites WHERE created_by = $1 AND NOT is_personal) AS sites`,
      [userId],
    );
    const unlimited = !user || user.role === UserRole.ADMIN;
    return {
      devices: {
        used: row.devices,
        limit: unlimited ? null : (user.device_quota ?? this.defaultOf('DEFAULT_DEVICE_QUOTA', 20)),
      },
      sites: {
        used: row.sites,
        limit: unlimited ? null : (user.site_quota ?? this.defaultOf('DEFAULT_SITE_QUOTA', 5)),
      },
    };
  }

  /** ตรวจก่อนสร้างอุปกรณ์/ไซต์ใหม่ให้ userId (เกินโควตา -> 403 พร้อมข้อความที่อ่านง่าย) */
  async assertCanAdd(userId: string, what: 'devices' | 'sites', adding = 1): Promise<void> {
    const u = (await this.usage(userId))[what];
    if (u.limit !== null && u.used + adding > u.limit) {
      const label = what === 'devices' ? 'อุปกรณ์' : 'ไซต์';
      throw new ForbiddenException(
        `ครบโควตา${label}แล้ว (${u.used}/${u.limit}) ลบ${label}ที่ไม่ใช้ หรือติดต่อผู้ดูแลระบบเพื่อขอเพิ่ม`,
      );
    }
  }
}
