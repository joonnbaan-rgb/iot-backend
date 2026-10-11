import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { DevicesService } from '../devices/devices.service';
import { DeviceAccessService } from '../device-access/device-access.service';
import { ensurePersonalSite } from '../sites/personal-site';

export type DeviceMode = 'delete' | 'transfer';

export interface DeletionResult {
  deleted_user: string;
  devices_deleted: number;
  devices_transferred: number;
  sites_reassigned: number;
}

/**
 * ลบผู้ใช้ (admin ระบบเท่านั้น) — จัดการข้อมูลที่ผูกอยู่ให้ครบก่อนลบ:
 *  - อุปกรณ์ของผู้ใช้: ลบทิ้งทั้งหมด (พร้อมข้อมูลเซนเซอร์/สตรีม) หรือโอนให้ admin ที่สั่งลบ
 *  - ไซต์ที่ผู้ใช้สร้างและยังมีคนอื่น/อุปกรณ์อยู่: โอนเป็นของ admin ที่สั่งลบ (ไม่หายตามผู้ใช้)
 *  - rule ของผู้ใช้ถูกลบ (ไม่ปล่อยให้ rule ไร้เจ้าของสั่งอุปกรณ์ต่อ), คำเชิญแชร์ที่ค้างของอีเมลนี้ถูกลบ
 *  - แถวที่ผูกด้วย ON DELETE CASCADE (refresh token, การแชร์, กลุ่ม, ช่องทางแจ้งเตือน ฯลฯ) หายตามอัตโนมัติ
 */
@Injectable()
export class UserDeletionService {
  private readonly logger = new Logger(UserDeletionService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly devices: DevicesService,
    private readonly access: DeviceAccessService,
  ) {}

  async deleteUser(actor: CurrentUserPayload, targetId: string, mode?: DeviceMode): Promise<DeletionResult> {
    if (targetId === actor.sub) throw new BadRequestException('ลบบัญชีของตัวเองไม่ได้');
    const target = await this.users.findOne({ where: { id: targetId } });
    if (!target) throw new NotFoundException('ไม่พบผู้ใช้');
    // ผู้สั่งลบเป็น admin อยู่แล้ว (RolesGuard) และไม่ใช่เป้าหมาย จึงยังมี admin เหลืออย่างน้อย 1 คนเสมอ

    const owned: { id: string }[] = await this.users.query(`SELECT id FROM devices WHERE owner_id = $1`, [targetId]);
    if (owned.length > 0 && mode !== 'delete' && mode !== 'transfer') {
      throw new BadRequestException(
        `ผู้ใช้นี้มีอุปกรณ์ ${owned.length} เครื่อง ระบุ devices=delete (ลบทิ้ง) หรือ devices=transfer (โอนให้คุณ)`,
      );
    }

    let devicesDeleted = 0;
    let devicesTransferred = 0;
    if (mode === 'delete') {
      for (const d of owned) {
        await this.devices.removeFor(actor, d.id); // ล้าง MediaMTX path / ข้อมูล / rule ของอุปกรณ์ด้วย
        devicesDeleted++;
      }
    } else if (mode === 'transfer' && owned.length > 0) {
      const site = await ensurePersonalSite(this.users.manager, actor.sub);
      await this.users.manager.transaction(async (m) => {
        for (const d of owned) {
          await m.query(`DELETE FROM device_shares WHERE device_id = $1`, [d.id]);
          await m.query(`DELETE FROM pending_shares WHERE device_id = $1`, [d.id]);
          await m.query(`DELETE FROM device_group_members WHERE device_id = $1`, [d.id]);
          await m.query(`UPDATE devices SET owner_id = $2, site_id = $3 WHERE id = $1`, [d.id, actor.sub, site]);
        }
      });
      devicesTransferred = owned.length;
    }

    let sitesReassigned = 0;
    await this.users.manager.transaction(async (m) => {
      // ไซต์ที่ผู้ใช้สร้าง (ไม่ใช่ไซต์ส่วนตัว) ที่ยังมีสมาชิกอื่นหรืออุปกรณ์ -> โอนให้ admin ผู้สั่งลบ
      const keep: { id: string }[] = await m.query(
        `SELECT s.id FROM sites s
          WHERE s.created_by = $1 AND NOT s.is_personal
            AND (EXISTS (SELECT 1 FROM site_members x WHERE x.site_id = s.id AND x.user_id <> $1)
                 OR EXISTS (SELECT 1 FROM devices d WHERE d.site_id = s.id))`,
        [targetId],
      );
      for (const s of keep) {
        await m.query(`UPDATE sites SET created_by = $2 WHERE id = $1`, [s.id, actor.sub]);
        await m.query(
          `INSERT INTO site_members (site_id, user_id, role) VALUES ($1,$2,'admin')
           ON CONFLICT (site_id, user_id) DO UPDATE SET role = 'admin'`,
          [s.id, actor.sub],
        );
      }
      sitesReassigned = keep.length;

      await m.query(`DELETE FROM rules WHERE owner_id = $1`, [targetId]);
      await m.query(`DELETE FROM pending_shares WHERE LOWER(email) = LOWER($1)`, [target.email]);
      await m.query(`DELETE FROM users WHERE id = $1`, [targetId]);
    });

    await this.access.pruneRules();
    this.logger.warn(`admin ${actor.email} ลบผู้ใช้ ${target.email} (อุปกรณ์ลบ ${devicesDeleted}, โอน ${devicesTransferred}, ไซต์โอน ${sitesReassigned})`);
    return {
      deleted_user: target.email,
      devices_deleted: devicesDeleted,
      devices_transferred: devicesTransferred,
      sites_reassigned: sitesReassigned,
    };
  }
}
