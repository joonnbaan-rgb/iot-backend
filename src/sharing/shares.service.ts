import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { Device } from '../devices/entities/device.entity';
import { User } from '../users/entities/user.entity';
import { DeviceAccessService } from '../device-access/device-access.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { DeviceGroup } from './entities/device-group.entity';
import { DeviceShare, SharePermission } from './entities/device-share.entity';
import { CreateShareDto } from './dto/share.dto';

export interface ShareView {
  id: string;
  scope: 'all' | 'device' | 'group';
  permission: SharePermission;
  device_id: string | null;
  device_name: string | null;
  group_id: string | null;
  group_name: string | null;
  /** อีเมลของอีกฝ่าย: outgoing = ผู้รับ, incoming = เจ้าของ */
  counterpart_email: string;
  counterpart_id: string;
  created_at: Date;
}

@Injectable()
export class SharesService {
  constructor(
    @InjectRepository(DeviceShare) private readonly shares: Repository<DeviceShare>,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    @InjectRepository(DeviceGroup) private readonly groups: Repository<DeviceGroup>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly access: DeviceAccessService,
    private readonly gateway: RealtimeGateway,
  ) {}

  // ---------- ภายใน ----------

  async recipientsOfGroup(groupId: string): Promise<string[]> {
    const rows = await this.shares.find({ where: { group_id: groupId }, select: { shared_with_id: true } });
    return rows.map((r) => r.shared_with_id);
  }

  /**
   * เรียกหลังสิทธิ์ใคร "ลดลง/ถูกถอน": ลบ rule ที่เกินสิทธิ์, ให้ socket ออกจากห้องที่ไม่มีสิทธิ์,
   * และแจ้งแอปของผู้รับให้รีเฟรชรายการ
   * ถ้าไม่ระบุ recipients = ใช้ทุกคนที่เคยได้รับแชร์ (กรณีสมาชิกกลุ่มเปลี่ยน)
   */
  async afterAccessChanged(recipients?: string[]): Promise<void> {
    await this.access.pruneRules();
    const ids: string[] =
      recipients ??
      (await this.shares.createQueryBuilder('s').select('DISTINCT s.shared_with_id', 'id').getRawMany()).map(
        (r: { id: string }) => r.id,
      );
    for (const userId of new Set(ids)) {
      await this.gateway.revalidateUser(userId);
      this.gateway.emitToUser(userId, 'shares:changed');
    }
  }

  // ---------- สร้าง/ดู/แก้/ถอน ----------

  async create(user: CurrentUserPayload, dto: CreateShareDto): Promise<ShareView[]> {
    const target = await this.users
      .createQueryBuilder('u')
      .where('LOWER(u.email) = LOWER(:email)', { email: dto.email.trim() })
      .getOne();
    if (!target) throw new NotFoundException('ไม่พบบัญชีผู้ใช้ที่มีอีเมลนี้');
    if (target.id === user.sub) throw new BadRequestException('แชร์ให้ตัวเองไม่ได้');

    const targets: { device_id: string | null; group_id: string | null }[] = [];
    if (dto.scope === 'all') {
      targets.push({ device_id: null, group_id: null });
    } else if (dto.scope === 'group') {
      if (!dto.group_id) throw new BadRequestException('ต้องระบุ group_id');
      const g = await this.groups.findOne({ where: { id: dto.group_id, owner_id: user.sub } });
      if (!g) throw new NotFoundException('ไม่พบกลุ่มนี้');
      targets.push({ device_id: null, group_id: g.id });
    } else {
      const ids = [...new Set(dto.device_ids ?? [])];
      if (ids.length === 0) throw new BadRequestException('ต้องเลือกอุปกรณ์อย่างน้อย 1 รายการ');
      const own = await this.devices.find({ where: { id: In(ids), owner_id: user.sub }, select: { id: true } });
      if (own.length !== ids.length) {
        throw new ForbiddenException('แชร์ได้เฉพาะอุปกรณ์ที่คุณเป็นเจ้าของ');
      }
      for (const id of ids) targets.push({ device_id: id, group_id: null });
    }

    let downgraded = false;
    const saved: DeviceShare[] = [];
    for (const t of targets) {
      const existing = await this.shares
        .createQueryBuilder('s')
        .where('s.owner_id = :o AND s.shared_with_id = :w', { o: user.sub, w: target.id })
        .andWhere(t.device_id ? 's.device_id = :d' : 's.device_id IS NULL', { d: t.device_id })
        .andWhere(t.group_id ? 's.group_id = :g' : 's.group_id IS NULL', { g: t.group_id })
        .getOne();
      if (existing) {
        if (existing.permission === 'control' && dto.permission === 'view') downgraded = true;
        existing.permission = dto.permission;
        saved.push(await this.shares.save(existing));
      } else {
        saved.push(
          await this.shares.save(
            this.shares.create({
              owner_id: user.sub,
              shared_with_id: target.id,
              device_id: t.device_id,
              group_id: t.group_id,
              permission: dto.permission,
            }),
          ),
        );
      }
    }
    if (downgraded) await this.afterAccessChanged([target.id]);
    else this.gateway.emitToUser(target.id, 'shares:changed');

    const views = await this.toViews(saved, 'outgoing');
    return views;
  }

  async listOutgoing(user: CurrentUserPayload): Promise<ShareView[]> {
    const rows = await this.shares.find({ where: { owner_id: user.sub }, order: { created_at: 'DESC' } });
    return this.toViews(rows, 'outgoing');
  }

  async listIncoming(user: CurrentUserPayload): Promise<ShareView[]> {
    const rows = await this.shares.find({ where: { shared_with_id: user.sub }, order: { created_at: 'DESC' } });
    return this.toViews(rows, 'incoming');
  }

  async updatePermission(user: CurrentUserPayload, id: string, permission: SharePermission): Promise<ShareView> {
    const share = await this.shares.findOne({ where: { id, owner_id: user.sub } });
    if (!share) throw new NotFoundException('ไม่พบการแชร์นี้');
    const downgraded = share.permission === 'control' && permission === 'view';
    share.permission = permission;
    await this.shares.save(share);
    if (downgraded) await this.afterAccessChanged([share.shared_with_id]);
    else this.gateway.emitToUser(share.shared_with_id, 'shares:changed');
    return (await this.toViews([share], 'outgoing'))[0];
  }

  /** เจ้าของถอนการแชร์ หรือผู้รับกด "ออกจากการแชร์" ก็ได้ */
  async revoke(user: CurrentUserPayload, id: string): Promise<void> {
    const share = await this.shares.findOne({ where: { id } });
    if (!share || (share.owner_id !== user.sub && share.shared_with_id !== user.sub)) {
      throw new NotFoundException('ไม่พบการแชร์นี้');
    }
    await this.shares.delete({ id });
    await this.afterAccessChanged([share.shared_with_id]);
    if (share.owner_id !== user.sub) this.gateway.emitToUser(share.owner_id, 'shares:changed');
  }

  // ---------- แปลงเป็นข้อมูลสำหรับแอป ----------

  private async toViews(rows: DeviceShare[], dir: 'outgoing' | 'incoming'): Promise<ShareView[]> {
    if (rows.length === 0) return [];
    const otherIds = [...new Set(rows.map((r) => (dir === 'outgoing' ? r.shared_with_id : r.owner_id)))];
    const users = await this.users.find({ where: { id: In(otherIds) }, select: { id: true, email: true } });
    const emailById = new Map<string, string>(users.map((u) => [u.id, u.email] as [string, string]));

    const deviceIds = [...new Set(rows.map((r) => r.device_id).filter((x): x is string => !!x))];
    const groupIds = [...new Set(rows.map((r) => r.group_id).filter((x): x is string => !!x))];
    const devs = deviceIds.length
      ? await this.devices.find({ where: { id: In(deviceIds) }, select: { id: true, name: true } })
      : [];
    const grps = groupIds.length
      ? await this.groups.find({ where: { id: In(groupIds) }, select: { id: true, name: true } })
      : [];
    const devName = new Map<string, string>(devs.map((d) => [d.id, d.name] as [string, string]));
    const grpName = new Map<string, string>(grps.map((g) => [g.id, g.name] as [string, string]));

    return rows.map((r) => {
      const other = dir === 'outgoing' ? r.shared_with_id : r.owner_id;
      return {
        id: r.id,
        scope: r.device_id ? 'device' : r.group_id ? 'group' : 'all',
        permission: r.permission,
        device_id: r.device_id,
        device_name: r.device_id ? (devName.get(r.device_id) ?? null) : null,
        group_id: r.group_id,
        group_name: r.group_id ? (grpName.get(r.group_id) ?? null) : null,
        counterpart_email: emailById.get(other) ?? '(ไม่ทราบ)',
        counterpart_id: other,
        created_at: r.created_at,
      };
    });
  }
}
