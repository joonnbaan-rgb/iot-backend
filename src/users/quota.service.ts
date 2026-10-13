import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { PlansService } from '../plans/plans.service';

export interface UsageView {
  devices: { used: number; limit: number | null };
  sites: { used: number; limit: number | null };
  cameras: { used: number; limit: number | null };
  plan: {
    id: string;
    name: string;
    expires_at: Date | null;
    expired: boolean;
    days_left: number | null; // null = ไม่หมดอายุ; ติดลบไม่มี (หมดอายุแล้วใช้ expired)
  };
  features: {
    recording_enabled: boolean;
    notification_types: string[];
    retention_days: number | null;
  };
}

/** โควตาและสิทธิ์ตามแพ็กเกจของผู้ใช้ (admin ไม่จำกัด; limit = null) */
@Injectable()
export class QuotaService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly plans: PlansService,
  ) {}

  async usage(userId: string): Promise<UsageView> {
    const l = await this.plans.limitsFor(userId);
    const [row] = await this.users.query(
      `SELECT (SELECT COUNT(*)::int FROM devices WHERE owner_id = $1) AS devices,
              (SELECT COUNT(*)::int FROM devices WHERE owner_id = $1 AND type = 'camera') AS cameras,
              (SELECT COUNT(*)::int FROM sites WHERE created_by = $1 AND NOT is_personal) AS sites`,
      [userId],
    );
    const daysLeft =
      l.expires_at && !l.expired ? Math.max(0, Math.ceil((new Date(l.expires_at).getTime() - Date.now()) / 86_400_000)) : null;
    return {
      devices: { used: row.devices, limit: l.device_quota },
      sites: { used: row.sites, limit: l.site_quota },
      cameras: { used: row.cameras, limit: l.camera_quota },
      plan: { id: l.plan_id, name: l.plan_name, expires_at: l.expires_at, expired: l.expired, days_left: daysLeft },
      features: {
        recording_enabled: l.recording_enabled,
        notification_types: l.notification_types,
        retention_days: l.retention_days,
      },
    };
  }

  /** ตรวจก่อนสร้างอุปกรณ์/ไซต์/กล้องใหม่ให้ userId (เกินโควตา -> 403 พร้อมข้อความที่อ่านง่าย) */
  async assertCanAdd(userId: string, what: 'devices' | 'sites' | 'cameras', adding = 1): Promise<void> {
    const usage = await this.usage(userId);
    const u = usage[what];
    if (u.limit !== null && u.used + adding > u.limit) {
      const label = what === 'devices' ? 'อุปกรณ์' : what === 'sites' ? 'ไซต์' : 'กล้อง';
      const plan = usage.plan.expired ? 'แพ็กเกจหมดอายุ (ใช้สิทธิ์ Free)' : `แพ็กเกจ ${usage.plan.name}`;
      throw new ForbiddenException(
        `ครบโควตา${label}แล้ว (${u.used}/${u.limit}) ${plan} ลบ${label}ที่ไม่ใช้ หรืออัปเกรดแพ็กเกจ/ติดต่อผู้ดูแลระบบ`,
      );
    }
  }
}
