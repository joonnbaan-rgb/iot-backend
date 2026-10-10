import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Device } from '../devices/entities/device.entity';
import { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';

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

export type DeviceWithAccess = Device & {
  access_level: AccessLevel;
  /** อีเมลเจ้าของ (ใส่เฉพาะอุปกรณ์ที่ถูกแชร์มาให้) */
  owner_email?: string | null;
};

/** เงื่อนไข SQL: แถวใน device_shares (alias s) ครอบคลุมอุปกรณ์ (alias d) ตัวนี้ */
const SHARE_COVERS_DEVICE = `
  s.owner_id = d.owner_id AND (
    s.device_id = d.id
    OR (s.device_id IS NULL AND s.group_id IS NULL)
    OR (s.group_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM device_group_members m WHERE m.group_id = s.group_id AND m.device_id = d.id))
  )`;

/** ระดับสิทธิ์จาก role ในไซต์ (SQL: lvl 3=admin 2=operator 1=viewer) */
const SITE_LVL = `CASE sm.role WHEN 'admin' THEN 3 WHEN 'operator' THEN 2 ELSE 1 END`;

@Injectable()
export class DeviceAccessService {
  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /** ปิดบังข้อมูลที่เฉพาะเจ้าของควรเห็น (เช่น RTSP URL ที่อาจมีรหัสผ่านกล้อง) */
  private redact<T extends Device>(device: T, level: AccessLevel): T {
    if (level === 'view' || level === 'control') {
      device.rtsp_url = null;
      device.connection = null; // IP ภายในบ้านของเจ้าของ ไม่เปิดเผยให้ผู้ที่ถูกแชร์
    }
    return device;
  }

  /** ระดับสิทธิ์ของ user ต่ออุปกรณ์ตัวนี้ (null = ไม่มีสิทธิ์เลย) */
  async levelFor(user: CurrentUserPayload, device: Device): Promise<AccessLevel | null> {
    if (user.role === UserRole.ADMIN) return 'admin';
    if (device.owner_id && device.owner_id === user.sub) return 'owner';
    // สิทธิ์จากการเป็นสมาชิกไซต์ที่อุปกรณ์สังกัด (admin ไซต์ = จัดการได้เหมือนเจ้าของ)
    let siteLvl = 0;
    if (device.site_id) {
      const sr: { lvl: number }[] = await this.deviceRepository.query(
        `SELECT ${SITE_LVL} AS lvl FROM site_members sm WHERE sm.site_id = $1 AND sm.user_id = $2`,
        [device.site_id, user.sub],
      );
      siteLvl = sr[0]?.lvl ?? 0;
    }
    if (siteLvl === 3) return 'owner';
    if (!device.owner_id) return siteLvl === 2 ? 'control' : siteLvl === 1 ? 'view' : null;
    const rows: { permission: string }[] = await this.deviceRepository.query(
      `SELECT s.permission FROM device_shares s, devices d
        WHERE d.id = $1 AND s.shared_with_id = $2 AND ${SHARE_COVERS_DEVICE}`,
      [device.id, user.sub],
    );
    const shareLvl = rows.length === 0 ? 0 : rows.some((r) => r.permission === 'control') ? 2 : 1;
    const best = Math.max(shareLvl, siteLvl);
    return best === 2 ? 'control' : best === 1 ? 'view' : null;
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
    this.redact(device, level);
    const result: DeviceWithAccess = Object.assign(device, { access_level: level });
    if (level === 'control' || level === 'view') {
      result.owner_email = await this.emailOf(device.owner_id);
    }
    return result;
  }

  private async emailOf(userId: string | null): Promise<string | null> {
    if (!userId) return null;
    const u = await this.userRepository.findOne({ where: { id: userId }, select: { id: true, email: true } });
    return u?.email ?? null;
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
    const result: DeviceWithAccess[] = own.map((d) =>
      Object.assign(d, { access_level: 'owner' as AccessLevel }),
    );

    const shared: { id: string; lvl: number }[] = await this.deviceRepository.query(
      `SELECT id, MAX(lvl)::int AS lvl FROM (
         SELECT d.id, CASE s.permission WHEN 'control' THEN 2 ELSE 1 END AS lvl
           FROM devices d JOIN device_shares s ON s.shared_with_id = $1 AND ${SHARE_COVERS_DEVICE}
          WHERE d.owner_id <> $1
         UNION ALL
         SELECT d.id, ${SITE_LVL} AS lvl
           FROM devices d JOIN site_members sm ON sm.site_id = d.site_id AND sm.user_id = $1
          WHERE d.owner_id IS DISTINCT FROM $1
       ) t GROUP BY id`,
      [user.sub],
    );
    if (shared.length > 0) {
      const lvlById = new Map(shared.map((r) => [r.id, r.lvl]));
      const devices = await this.deviceRepository.find({
        where: { id: In([...lvlById.keys()]) },
        order: { created_at: 'ASC' },
      });
      const owners = await this.userRepository.find({
        where: { id: In([...new Set(devices.map((d) => d.owner_id).filter((x): x is string => !!x))]) },
        select: { id: true, email: true },
      });
      const emailById = new Map(owners.map((o) => [o.id, o.email]));
      for (const d of devices) {
        const l = lvlById.get(d.id) ?? 1;
        const level: AccessLevel = l >= 3 ? 'owner' : l === 2 ? 'control' : 'view';
        this.redact(d, level);
        result.push(
          Object.assign(d, {
            access_level: level,
            owner_email: d.owner_id ? (emailById.get(d.owner_id) ?? null) : null,
          }),
        );
      }
    }
    return result;
  }

  /** user id ทั้งหมดที่ควรได้รับ event ของอุปกรณ์นี้ (ไม่รวม admin ซึ่งอยู่ในห้อง admins อยู่แล้ว) */
  async audienceUserIds(deviceId: string): Promise<string[]> {
    const device = await this.deviceRepository.findOne({ where: { id: deviceId } });
    if (!device) return [];
    const rows: { uid: string }[] = await this.deviceRepository.query(
      `SELECT DISTINCT s.shared_with_id AS uid FROM device_shares s, devices d
        WHERE d.id = $1 AND ${SHARE_COVERS_DEVICE}
       UNION
       SELECT sm.user_id FROM site_members sm WHERE sm.site_id = $2`,
      [deviceId, device.site_id],
    );
    const ids = rows.map((r) => r.uid);
    if (device.owner_id) ids.push(device.owner_id);
    return [...new Set(ids)];
  }

  /**
   * ลบ rule ของผู้ใช้ (ที่ไม่ใช่ admin) ที่ไม่มีสิทธิ์พอแล้ว: เซนเซอร์ต้องยัง "ดูได้" และเป้าหมายต้องยัง "สั่งได้"
   * เรียกหลังเพิกถอน/ลดสิทธิ์แชร์ หรือแก้สมาชิกกลุ่ม เพื่อไม่ให้ rule เก่ายังสั่งอุปกรณ์ของคนอื่นต่อไป
   */
  async pruneRules(): Promise<number> {
    const rows = await this.deviceRepository.query(`
      WITH access AS (
        SELECT d.owner_id AS user_id, d.id AS device_id, 3 AS lvl FROM devices d WHERE d.owner_id IS NOT NULL
        UNION ALL
        SELECT s.shared_with_id, d.id, CASE s.permission WHEN 'control' THEN 2 ELSE 1 END
          FROM device_shares s JOIN devices d ON ${SHARE_COVERS_DEVICE}
        UNION ALL
        SELECT sm.user_id, d.id, ${SITE_LVL}
          FROM site_members sm JOIN devices d ON d.site_id = sm.site_id
      )
      DELETE FROM rules r USING users u
       WHERE u.id = r.owner_id AND u.role <> 'admin'
         AND (
           NOT EXISTS (SELECT 1 FROM access a WHERE a.user_id = r.owner_id AND a.device_id = r.sensor_device_id)
           OR NOT EXISTS (SELECT 1 FROM access a WHERE a.user_id = r.owner_id AND a.device_id = r.target_device_id AND a.lvl >= 2)
         )
      RETURNING r.id
    `);
    // TypeORM คืน [rows, count] สำหรับ DELETE ... RETURNING บางเวอร์ชัน คืน rows ตรงๆ บางเวอร์ชัน
    const deleted = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : rows;
    return Array.isArray(deleted) ? deleted.length : 0;
  }
}
