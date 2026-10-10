import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from '../users/entities/user.entity';
import { ensurePersonalSite } from '../sites/personal-site';
import { Device, DeviceType } from './entities/device.entity';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { DeviceAccessService, DeviceWithAccess } from '../device-access/device-access.service';
import { CamerasService } from '../cameras/cameras.service';

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    private readonly access: DeviceAccessService,
    private readonly camerasService: CamerasService,
  ) {}

  // ---------- ใช้ภายในระบบ (ไม่ตรวจสิทธิ์: เรียกจาก MQTT/ingestion ฯลฯ) ----------

  findAll(): Promise<Device[]> {
    return this.deviceRepository.find();
  }

  async findOne(id: string): Promise<Device> {
    const device = await this.deviceRepository.findOne({ where: { id } });
    if (!device) {
      throw new NotFoundException(`ไม่พบอุปกรณ์ id: ${id}`);
    }
    return device;
  }

  async updateStatus(id: string, status: Device['status']): Promise<Device> {
    const device = await this.findOne(id);
    device.status = status;
    return this.deviceRepository.save(device);
  }

  // ---------- ใช้จาก API (ตรวจสิทธิ์ตามผู้ใช้) ----------

  listFor(user: CurrentUserPayload): Promise<DeviceWithAccess[]> {
    return this.access.listFor(user);
  }

  getFor(user: CurrentUserPayload, id: string): Promise<DeviceWithAccess> {
    return this.access.assert(user, id, 'view');
  }

  async createFor(user: CurrentUserPayload, dto: CreateDeviceDto): Promise<DeviceWithAccess> {
    const isCamera = dto.type === DeviceType.CAMERA;
    const siteId = dto.site_id
      ? (await this.assertSiteAdmin(user, dto.site_id), dto.site_id)
      : await ensurePersonalSite(this.deviceRepository.manager, user.sub);
    const device = this.deviceRepository.create({
      name: dto.name,
      type: dto.type,
      location: dto.location,
      connection:
        dto.connection_protocol && dto.connection_host
          ? { protocol: dto.connection_protocol, host: dto.connection_host }
          : null,
      rtsp_url: null, // ตั้งผ่าน setSource ด้านล่าง เพื่อให้ MediaMTX ลงทะเบียน path ไปพร้อมกัน
      owner_id: user.sub,
      site_id: siteId,
    });
    const saved = await this.deviceRepository.save(device);

    if (isCamera && dto.rtsp_url) {
      try {
        await this.camerasService.setSource(saved.id, dto.rtsp_url);
      } catch (err) {
        // สร้างอุปกรณ์สำเร็จแล้ว แต่ลงทะเบียนสตรีมไม่สำเร็จ (เช่น MediaMTX ยังไม่พร้อม)
        // ไม่ล้มทั้งคำขอ ผู้ใช้กด "บันทึกและเชื่อมต่อ" ในหน้ากล้องเพื่อลองใหม่ได้
        this.logger.warn(`ตั้ง RTSP source ให้กล้อง ${saved.id} ไม่สำเร็จ: ${(err as Error).message}`);
      }
    }
    return this.access.assert(user, saved.id, 'view');
  }

  async updateFor(user: CurrentUserPayload, id: string, dto: UpdateDeviceDto): Promise<DeviceWithAccess> {
    const device = await this.access.assert(user, id, 'manage');
    if (dto.name !== undefined) device.name = dto.name;
    if (dto.location !== undefined) device.location = dto.location;
    if (dto.site_id !== undefined && dto.site_id !== device.site_id) {
      await this.assertSiteAdmin(user, dto.site_id);
      device.site_id = dto.site_id;
    }
    const { access_level } = device;
    const saved = await this.deviceRepository.save(device);
    return Object.assign(saved, { access_level });
  }

  /**
   * ลบอุปกรณ์พร้อมข้อมูลที่เกี่ยวข้องทั้งหมด (telemetry, ประวัติคำสั่ง, rule ที่อ้างอิง, คลิปกล้อง)
   * sensor_data/device_commands ไม่มี FK จึงต้องลบเองใน transaction เดียวกัน
   */
  async removeFor(user: CurrentUserPayload, id: string): Promise<void> {
    const device = await this.access.assert(user, id, 'manage');

    if (device.type === DeviceType.CAMERA) {
      await this.camerasService.removeDeviceArtifacts(id); // best-effort: ไม่ throw
    }

    await this.deviceRepository.manager.transaction(async (m) => {
      await m.query(`DELETE FROM "sensor_data" WHERE "device_id" = $1`, [id]);
      await m.query(`DELETE FROM "device_commands" WHERE "device_id" = $1`, [id]);
      await m.query(`DELETE FROM "rules" WHERE "sensor_device_id" = $1 OR "target_device_id" = $1`, [id]);
      await m.query(`DELETE FROM "devices" WHERE "id" = $1`, [id]); // camera_recordings ลบตาม ON DELETE CASCADE
    });
  }

  /** ต้องเป็นผู้ดูแลของไซต์ปลายทาง (global admin ผ่านเสมอ) */
  private async assertSiteAdmin(user: CurrentUserPayload, siteId: string): Promise<void> {
    if (user.role === UserRole.ADMIN) {
      const r = await this.deviceRepository.query(`SELECT 1 FROM sites WHERE id = $1`, [siteId]);
      if (r.length === 0) throw new NotFoundException('ไม่พบไซต์');
      return;
    }
    const r = await this.deviceRepository.query(
      `SELECT role FROM site_members WHERE site_id = $1 AND user_id = $2`,
      [siteId, user.sub],
    );
    if (r.length === 0) throw new NotFoundException('ไม่พบไซต์');
    if (r[0].role !== 'admin') throw new ForbiddenException('ต้องเป็นผู้ดูแลไซต์นี้จึงจะวางอุปกรณ์ได้');
  }
}
