import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { Plan } from './entities/plan.entity';
import { UpdatePlanDto } from './dto/update-plan.dto';

export const ALL_CHANNEL_TYPES = ['telegram', 'line', 'email'];
/** แพ็กเกจที่ใช้เมื่อหมดอายุ */
export const FALLBACK_PLAN = 'free';
/** หมดอายุแล้วกี่วันจึงเริ่มลบข้อมูลเซนเซอร์ตามอายุเก็บของแพ็กเกจ Free (เวลาผ่อนผัน) */
const RETENTION_GRACE_DAYS = 30;

export interface EffectiveLimits {
  plan_id: string; // แพ็กเกจที่ผู้ใช้ถืออยู่
  plan_name: string;
  expires_at: Date | null;
  expired: boolean; // หมดอายุแล้ว -> ใช้สิทธิ์ของ Free
  unlimited: boolean; // admin ไม่จำกัด
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

  /** ข้อจำกัดที่มีผลจริงของผู้ใช้ (โควตารายคนที่ admin ตั้งไว้ override ค่าของแพ็กเกจ) */
  async limitsFor(userId: string): Promise<EffectiveLimits> {
    const rows: {
      role: string;
      plan_id: string;
      plan_expires_at: Date | null;
      device_quota: number | null;
      site_quota: number | null;
    }[] = await this.plans.query(
      `SELECT role, plan_id, plan_expires_at, device_quota, site_quota FROM users WHERE id = $1`,
      [userId],
    );
    const u = rows[0];
    if (!u) throw new NotFoundException('ไม่พบผู้ใช้');
    const held = (await this.plans.findOne({ where: { id: u.plan_id } })) ?? (await this.plans.findOne({ where: { id: FALLBACK_PLAN } }));
    if (!held) throw new BadRequestException('ยังไม่ได้ตั้งค่าแพ็กเกจในระบบ');
    const expired = !!u.plan_expires_at && new Date(u.plan_expires_at).getTime() < Date.now();
    const effective = expired ? ((await this.plans.findOne({ where: { id: FALLBACK_PLAN } })) ?? held) : held;
    const admin = u.role === 'admin';
    return {
      plan_id: held.id,
      plan_name: held.name,
      expires_at: u.plan_expires_at,
      expired,
      unlimited: admin,
      device_quota: admin ? null : (u.device_quota ?? effective.device_quota),
      site_quota: admin ? null : (u.site_quota ?? effective.site_quota),
      camera_quota: admin ? null : effective.camera_quota,
      recording_enabled: admin ? true : effective.recording_enabled,
      notification_types: admin ? ALL_CHANNEL_TYPES : effective.notification_types,
      retention_days: admin ? null : effective.retention_days,
    };
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
