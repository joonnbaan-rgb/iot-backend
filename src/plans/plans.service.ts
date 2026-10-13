import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { Plan } from './entities/plan.entity';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { CreatePlanDto } from './dto/create-plan.dto';

export const ALL_CHANNEL_TYPES = ['telegram', 'line', 'email'];
/** แพ็กเกจที่ใช้เมื่อหมดอายุ */
export const FALLBACK_PLAN = 'free';
/** หมดอายุแล้วกี่วันจึงเริ่มลบข้อมูลเซนเซอร์ตามอายุเก็บของแพ็กเกจ Free (เวลาผ่อนผัน) */
const RETENTION_GRACE_DAYS = 30;

/** สิทธิ์รายคนที่ admin กำหนดทับแพ็กเกจ (ไม่มีคีย์ = ตามแพ็กเกจ) */
export interface PlanOverrides {
  camera_quota?: number;
  recording_enabled?: boolean;
  notification_types?: string[];
  retention_days?: number;
  retention_unlimited?: boolean;
}

export interface EffectiveLimits {
  plan_id: string; // แพ็กเกจที่ผู้ใช้ถืออยู่
  plan_name: string;
  expires_at: Date | null;
  expired: boolean; // หมดอายุแล้ว -> ใช้สิทธิ์ของ Free
  unlimited: boolean; // admin ไม่จำกัด
  viewer: boolean; // ไม่มีอุปกรณ์ของตัวเอง (ใช้อุปกรณ์ที่ถูกแชร์) ไม่ต้องมีแพ็กเกจ/ไม่มีวันหมดอายุ
  device_quota: number | null;
  site_quota: number | null;
  camera_quota: number | null;
  recording_enabled: boolean;
  notification_types: string[];
  retention_days: number | null;
}

/** แพ็กเกจสมาชิกและข้อจำกัดที่มีผลจริงของผู้ใช้แต่ละคน (admin ไม่จำกัด; หมดอายุ = สิทธิ์ Free) */
@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);

  constructor(@InjectRepository(Plan) private readonly plans: Repository<Plan>) {}

  list(): Promise<Plan[]> {
    return this.plans.find({ order: { sort_order: 'ASC' } });
  }

  async exists(id: string): Promise<boolean> {
    return (await this.plans.count({ where: { id } })) > 0;
  }

  async update(id: string, dto: UpdatePlanDto): Promise<Plan> {
    const plan = await this.plans.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('ไม่พบแพ็กเกจนี้');
    if (dto.name !== undefined) plan.name = dto.name;
    if (dto.device_quota !== undefined) plan.device_quota = dto.device_quota;
    if (dto.site_quota !== undefined) plan.site_quota = dto.site_quota;
    if (dto.camera_quota !== undefined) plan.camera_quota = dto.camera_quota;
    if (dto.recording_enabled !== undefined) plan.recording_enabled = dto.recording_enabled;
    if (dto.notification_types !== undefined) plan.notification_types = dto.notification_types;
    if (dto.retention_days !== undefined) plan.retention_days = dto.retention_days;
    return this.plans.save(plan);
  }

  /** ข้อจำกัดที่มีผลจริงของผู้ใช้: แพ็กเกจ แล้วทับด้วยค่ารายคนที่ admin ตั้งไว้ (admin ระบบไม่จำกัด) */
  async limitsFor(userId: string): Promise<EffectiveLimits> {
    const rows: {
      role: string;
      plan_id: string;
      plan_expires_at: Date | null;
      device_quota: number | null;
      site_quota: number | null;
      plan_overrides: PlanOverrides | null;
      owned: number;
    }[] = await this.plans.query(
      `SELECT role, plan_id, plan_expires_at, device_quota, site_quota, plan_overrides,
              (SELECT COUNT(*)::int FROM devices WHERE owner_id = users.id) AS owned
         FROM users WHERE id = $1`,
      [userId],
    );
    const u = rows[0];
    if (!u) throw new NotFoundException('ไม่พบผู้ใช้');
    const held = (await this.plans.findOne({ where: { id: u.plan_id } })) ?? (await this.plans.findOne({ where: { id: FALLBACK_PLAN } }));
    if (!held) throw new BadRequestException('ยังไม่ได้ตั้งค่าแพ็กเกจในระบบ');
    const expired = !!u.plan_expires_at && new Date(u.plan_expires_at).getTime() < Date.now();
    const effective = expired ? ((await this.plans.findOne({ where: { id: FALLBACK_PLAN } })) ?? held) : held;
    const admin = u.role === 'admin';
    const viewer = !admin && u.owned === 0;
    const o = u.plan_overrides ?? {};
    return {
      plan_id: held.id,
      plan_name: held.name,
      expires_at: u.plan_expires_at,
      // ผู้รับแชร์ที่ไม่มีอุปกรณ์ของตัวเองไม่ต้องมีแพ็กเกจ จึงไม่แสดงว่าหมดอายุ (โควตาการสร้างอุปกรณ์ยังคิดตามจริง)
      expired: expired && !viewer,
      unlimited: admin,
      viewer,
      device_quota: admin ? null : (u.device_quota ?? effective.device_quota),
      site_quota: admin ? null : (u.site_quota ?? effective.site_quota),
      camera_quota: admin ? null : (o.camera_quota ?? effective.camera_quota),
      recording_enabled: admin ? true : (o.recording_enabled ?? effective.recording_enabled),
      notification_types: admin || viewer ? ALL_CHANNEL_TYPES : (o.notification_types ?? effective.notification_types),
      retention_days: admin ? null : o.retention_unlimited ? null : (o.retention_days ?? effective.retention_days),
    };
  }

  /** ตรวจและล้างค่าสิทธิ์รายคนที่ admin ส่งมา (เก็บเฉพาะคีย์ที่รู้จัก; null/ว่าง = ไม่มี) */
  sanitizeOverrides(raw: unknown): PlanOverrides | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('plan_overrides ต้องเป็นอ็อบเจ็กต์');
    const r = raw as Record<string, unknown>;
    const out: PlanOverrides = {};
    const int = (k: string, min: number, max: number): number | undefined => {
      const v = r[k];
      if (v === null || v === undefined) return undefined;
      if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
        throw new BadRequestException(`${k} ต้องเป็นจำนวนเต็ม ${min}-${max}`);
      }
      return v;
    };
    const cam = int('camera_quota', 0, 100000);
    if (cam !== undefined) out.camera_quota = cam;
    if (r.recording_enabled !== null && r.recording_enabled !== undefined) {
      if (typeof r.recording_enabled !== 'boolean') throw new BadRequestException('recording_enabled ต้องเป็น true/false');
      out.recording_enabled = r.recording_enabled;
    }
    if (r.notification_types !== null && r.notification_types !== undefined) {
      const arr = r.notification_types;
      if (!Array.isArray(arr) || arr.some((x) => !ALL_CHANNEL_TYPES.includes(x as string))) {
        throw new BadRequestException('notification_types ต้องเป็นรายการของ telegram, line, email');
      }
      out.notification_types = [...new Set(arr as string[])];
    }
    if (r.retention_unlimited === true) out.retention_unlimited = true;
    else {
      const ret = int('retention_days', 1, 36500);
      if (ret !== undefined) out.retention_days = ret;
    }
    return Object.keys(out).length > 0 ? out : null;
  }

  async create(dto: CreatePlanDto): Promise<Plan> {
    if (await this.exists(dto.id)) throw new BadRequestException('มีรหัสแพ็กเกจนี้อยู่แล้ว');
    const max = await this.plans.query(`SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM plans`);
    return this.plans.save(
      this.plans.create({
        id: dto.id,
        name: dto.name,
        sort_order: max[0]?.n ?? 99,
        device_quota: dto.device_quota,
        site_quota: dto.site_quota,
        camera_quota: dto.camera_quota,
        recording_enabled: dto.recording_enabled ?? false,
        notification_types: dto.notification_types ?? [],
        retention_days: dto.retention_days ?? null,
      }),
    );
  }

  async remove(id: string): Promise<void> {
    if (id === FALLBACK_PLAN) throw new BadRequestException('ลบแพ็กเกจ Free ไม่ได้ (ใช้เป็นสิทธิ์พื้นฐานเมื่อหมดอายุ)');
    const [{ n }] = await this.plans.query(`SELECT COUNT(*)::int AS n FROM users WHERE plan_id = $1`, [id]);
    if (n > 0) throw new BadRequestException(`ยังมีผู้ใช้ ${n} คนใช้แพ็กเกจนี้อยู่ ย้ายผู้ใช้ไปแพ็กเกจอื่นก่อน`);
    const res = await this.plans.delete({ id });
    if (!res.affected) throw new NotFoundException('ไม่พบแพ็กเกจนี้');
  }

  /**
   * ให้วันโปรโมชันแก่ผู้ใช้: ผู้ใช้ Free/หมดอายุ -> เปลี่ยนเป็นแพ็กเกจรางวัลนับจากวันนี้,
   * ผู้ใช้ที่มีวันหมดอายุอยู่ -> ต่ออายุเพิ่ม, แพ็กเกจถาวร (ไม่มีวันหมดอายุ) และ admin -> ไม่ต้องเพิ่ม
   * คืนจำนวนวันที่เพิ่มให้จริง (0 = ไม่ได้เพิ่ม)
   */
  async grantDays(userId: string, days: number, rewardPlan: string): Promise<number> {
    if (days <= 0) return 0;
    const rows: { role: string; plan_id: string; plan_expires_at: Date | null }[] = await this.plans.query(
      `SELECT role, plan_id, plan_expires_at FROM users WHERE id = $1`,
      [userId],
    );
    const u = rows[0];
    if (!u || u.role === 'admin') return 0;
    const now = Date.now();
    const exp = u.plan_expires_at ? new Date(u.plan_expires_at).getTime() : null;
    const lapsed = u.plan_id === FALLBACK_PLAN || (exp !== null && exp < now);
    const ms = days * 86_400_000;
    if (lapsed) {
      const plan = (await this.exists(rewardPlan)) ? rewardPlan : u.plan_id;
      await this.plans.query(`UPDATE users SET plan_id = $2, plan_expires_at = $3 WHERE id = $1`, [userId, plan, new Date(now + ms)]);
      return days;
    }
    if (exp === null) return 0;
    await this.plans.query(`UPDATE users SET plan_expires_at = $2 WHERE id = $1`, [userId, new Date(exp + ms)]);
    return days;
  }

  async allowedChannelTypes(userId: string): Promise<string[]> {
    return (await this.limitsFor(userId)).notification_types;
  }

  /** ผู้ใช้เพิ่มช่องทางประเภทนี้ได้ตามแพ็กเกจหรือไม่ (ไม่ได้ -> 403) */
  async assertChannelAllowed(userId: string, type: string): Promise<void> {
    const l = await this.limitsFor(userId);
    if (!l.notification_types.includes(type)) {
      throw new ForbiddenException(
        `แพ็กเกจ ${l.expired ? 'Free (แพ็กเกจเดิมหมดอายุ)' : l.plan_name} ใช้ช่องทางนี้ไม่ได้ อัปเกรดแพ็กเกจหรือติดต่อผู้ดูแลระบบ`,
      );
    }
  }

  /** เจ้าของกล้องตัวนี้บันทึกคลิปได้ตามแพ็กเกจหรือไม่ */
  async recordingAllowedForDevice(deviceId: string): Promise<boolean> {
    const rows: { owner_id: string | null }[] = await this.plans.query(`SELECT owner_id FROM devices WHERE id = $1`, [deviceId]);
    const owner = rows[0]?.owner_id;
    if (!owner) return false; // ไม่มีเจ้าของ/ไม่มีอุปกรณ์แล้ว ไม่เก็บ
    return (await this.limitsFor(owner)).recording_enabled;
  }

  /**
   * ทุกวัน 03:30: ลบข้อมูลเซนเซอร์ดิบที่เก่ากว่าอายุเก็บของแพ็กเกจเจ้าของอุปกรณ์ (admin ไม่ลบ)
   * หมดอายุแล้วมีเวลาผ่อนผัน 30 วันก่อนจะถูกนับเป็น Free
   * (ข้อมูลสรุปรายชั่วโมง/5 นาที และ retention กลางของ Timescale ไม่ถูกแตะ)
   */
  @Cron('0 30 3 * * *')
  async purgeSensorData(): Promise<void> {
    try {
      await this.plans.query(
        `DELETE FROM sensor_data s
           USING devices d, users u, plans p
          WHERE s.device_id = d.id
            AND d.owner_id = u.id
            AND u.role <> 'admin'
            AND p.id = CASE WHEN u.plan_expires_at IS NOT NULL
                             AND u.plan_expires_at < now() - make_interval(days => ${RETENTION_GRACE_DAYS})
                            THEN '${FALLBACK_PLAN}' ELSE u.plan_id END
            AND p.retention_days IS NOT NULL
            AND s.recorded_at < now() - make_interval(days => p.retention_days)`,
      );
      this.logger.log('ลบข้อมูลเซนเซอร์เกินอายุเก็บตามแพ็กเกจเรียบร้อย');
    } catch (err) {
      this.logger.error(`ลบข้อมูลเซนเซอร์ตามแพ็กเกจล้มเหลว: ${(err as Error).message}`);
    }
  }
}
