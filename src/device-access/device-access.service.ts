import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Device } from '../devices/entities/device.entity';
import { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

/**
 * ระดับสิทธิ์ที่ endpoint ต้องการ
 *  - view:    ดูข้อมูล/telemetry/สตรีมได้
 *  - control: ดูได้ + สั่งงานอุปกรณ์ได้
 *  - manage:  แก้ไข/ลบ/ตั้งค่า (เจ้าของหรือ admin เท่านั้น)
 */
export type AccessNeed = 'view' | 'control' | 'manage';

/** ระดับสิทธิ์จริงที่ผู้ใช้มีต่ออุปกรณ์นั้น (ส่งกลับให้แอปใช้ซ่อน/แสดงปุ่ม) */
export type AccessLevel = 'admin' | 'owner' | 'control' | 'view';

const RANK: Record<AccessNeed, number> = { view: 1, control: 2, manage: 3 };

function levelRank(level: AccessLevel): number {
  switch (level) {
    case 'admin':
    case 'owner':
      return RANK.manage;
    case 'control':
      return RANK.control;
    default:
      return RANK.view;
  }
}

export type DeviceWithAccess = Device & { access_level: AccessLevel };

@Injectable()
export class DeviceAccessService {
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
  ) {}

  /** ระดับสิทธิ์ของ user ต่ออุปกรณ์ตัวนี้ (null = ไม่มีสิทธิ์เลย) */
  async levelFor(user: CurrentUserPayload, device: Device): Promise<AccessLevel | null> {
    if (user.role === UserRole.ADMIN) return 'admin';
    if (device.owner_id && device.owner_id === user.sub) return 'owner';
    return null;
  }

  /**
   * ตรวจสิทธิ์ แล้วคืน device ถ้าผ่าน
   *  - ไม่มีอุปกรณ์ หรือผู้ใช้ไม่มีสิทธิ์เห็นเลย -> 404 (ไม่เปิดเผยว่ามีอุปกรณ์นี้อยู่)
   *  - เห็นได้แต่สิทธิ์ไม่พอสำหรับการกระทำนี้ -> 403
   */
  async assert(user: CurrentUserPayload, deviceId: string, need: AccessNeed): Promise<DeviceWithAccess> {
    const device = await this.deviceRepository.findOne({ where: { id: deviceId } });
    if (!device) {
      throw new NotFoundException(`ไม่พบอุปกรณ์ id: ${deviceId}`);
    }
    const level = await this.levelFor(user, device);
    if (!level) {
      throw new NotFoundException(`ไม่พบอุปกรณ์ id: ${deviceId}`);
    }
    if (levelRank(level) < RANK[need]) {
      throw new ForbiddenException('คุณไม่มีสิทธิ์ทำรายการนี้กับอุปกรณ์นี้');
    }
    return Object.assign(device, { access_level: level });
  }

  /** รายการอุปกรณ์ทั้งหมดที่ user มองเห็น พร้อมระดับสิทธิ์ */
  async listFor(user: CurrentUserPayload): Promise<DeviceWithAccess[]> {
    if (user.role === UserRole.ADMIN) {
      const all = await this.deviceRepository.find({ order: { created_at: 'ASC' } });
      return all.map((d) => Object.assign(d, { access_level: 'admin' as AccessLevel }));
    }
    const own = await this.deviceRepository.find({
      where: { owner_id: user.sub },
      order: { created_at: 'ASC' },
    });
    return own.map((d) => Object.assign(d, { access_level: 'owner' as AccessLevel }));
  }

  /** user id ทั้งหมดที่ควรได้รับ event ของอุปกรณ์นี้ (ไม่รวม admin ซึ่งอยู่ในห้อง admins อยู่แล้ว) */
  async audienceUserIds(deviceId: string): Promise<string[]> {
    const device = await this.deviceRepository.findOne({ where: { id: deviceId } });
    return device?.owner_id ? [device.owner_id] : [];
  }
}
