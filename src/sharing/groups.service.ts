import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { Device } from '../devices/entities/device.entity';
import { DeviceGroup } from './entities/device-group.entity';
import { DeviceGroupMember } from './entities/device-group-member.entity';
import { CreateGroupDto, UpdateGroupDto } from './dto/group.dto';
import { SharesService } from './shares.service';

export interface GroupView {
  id: string;
  name: string;
  device_ids: string[];
  created_at: Date;
}

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(DeviceGroup) private readonly groups: Repository<DeviceGroup>,
    @InjectRepository(DeviceGroupMember) private readonly members: Repository<DeviceGroupMember>,
    @InjectRepository(Device) private readonly devices: Repository<Device>,
    private readonly shares: SharesService,
  ) {}

  /** กลุ่มเป็นของเจ้าของคนเดียว (admin ก็จัดการได้เฉพาะกลุ่มของตัวเอง) */
  private async getOwned(user: CurrentUserPayload, id: string): Promise<DeviceGroup> {
    const g = await this.groups.findOne({ where: { id, owner_id: user.sub } });
    if (!g) throw new NotFoundException('ไม่พบกลุ่มนี้');
    return g;
  }

  /** ในกลุ่มใส่ได้เฉพาะอุปกรณ์ที่ตัวเองเป็นเจ้าของ */
  private async assertOwnDevices(user: CurrentUserPayload, deviceIds: string[]): Promise<string[]> {
    const ids = [...new Set(deviceIds)];
    if (ids.length === 0) return [];
    const found = await this.devices.find({ where: { id: In(ids), owner_id: user.sub }, select: { id: true } });
    if (found.length !== ids.length) {
      throw new BadRequestException('มีอุปกรณ์ที่ไม่ใช่ของคุณหรือไม่พบอุปกรณ์ในรายการ');
    }
    return ids;
  }

  private async view(groupList: DeviceGroup[]): Promise<GroupView[]> {
    if (groupList.length === 0) return [];
    const rows = await this.members.find({ where: { group_id: In(groupList.map((g) => g.id)) } });
    const byGroup = new Map<string, string[]>();
    for (const r of rows) {
      const list = byGroup.get(r.group_id) ?? [];
      list.push(r.device_id);
      byGroup.set(r.group_id, list);
    }
    return groupList.map((g) => ({
      id: g.id,
      name: g.name,
      device_ids: byGroup.get(g.id) ?? [],
      created_at: g.created_at,
    }));
  }

  async list(user: CurrentUserPayload): Promise<GroupView[]> {
    const list = await this.groups.find({ where: { owner_id: user.sub }, order: { created_at: 'ASC' } });
    return this.view(list);
  }

  async create(user: CurrentUserPayload, dto: CreateGroupDto): Promise<GroupView> {
    const ids = await this.assertOwnDevices(user, dto.device_ids ?? []);
    const group = await this.groups.save(this.groups.create({ owner_id: user.sub, name: dto.name.trim() }));
    if (ids.length) {
      await this.members.insert(ids.map((device_id) => ({ group_id: group.id, device_id })));
    }
    return (await this.view([group]))[0];
  }

  async update(user: CurrentUserPayload, id: string, dto: UpdateGroupDto): Promise<GroupView> {
    const group = await this.getOwned(user, id);
    if (dto.name !== undefined) {
      group.name = dto.name.trim();
      await this.groups.save(group);
    }
    if (dto.device_ids !== undefined) {
      const ids = await this.assertOwnDevices(user, dto.device_ids);
      await this.members.manager.transaction(async (m) => {
        await m.delete(DeviceGroupMember, { group_id: id });
        if (ids.length) await m.insert(DeviceGroupMember, ids.map((device_id) => ({ group_id: id, device_id })));
      });
      // สมาชิกกลุ่มเปลี่ยน = สิทธิ์ของคนที่ได้รับแชร์ทั้งกลุ่มเปลี่ยนตาม
      await this.shares.afterAccessChanged();
    }
    return (await this.view([group]))[0];
  }

  async remove(user: CurrentUserPayload, id: string): Promise<void> {
    await this.getOwned(user, id);
    const recipients = await this.shares.recipientsOfGroup(id);
    await this.groups.delete({ id }); // สมาชิกและการแชร์ของกลุ่มนี้ลบตาม ON DELETE CASCADE
    await this.shares.afterAccessChanged(recipients);
  }
}
