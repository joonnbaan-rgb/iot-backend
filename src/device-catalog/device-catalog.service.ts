import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceProfile } from './entities/device-profile.entity';
import { BUILTIN_PROFILES } from './catalog.data';
import { CreateProfileDto, UpdateProfileDto } from './dto/profile.dto';

@Injectable()
export class DeviceCatalogService implements OnModuleInit {
  private readonly logger = new Logger(DeviceCatalogService.name);

  constructor(@InjectRepository(DeviceProfile) private readonly profiles: Repository<DeviceProfile>) {}

  /** seed/อัปเดตโปรไฟล์ builtin ทุกครั้งที่เริ่มทำงาน (คงค่า enabled ที่ admin ตั้งไว้; ไม่ทับโปรไฟล์ custom ที่ id ซ้ำ) */
  async onModuleInit(): Promise<void> {
    try {
      for (const p of BUILTIN_PROFILES) {
        await this.profiles.query(
          `INSERT INTO device_profiles
             (id, vendor, model, device_type, protocol, integration, description, default_name, default_unit,
              fields, rtsp_templates, steps, snippets, links, notes, tags, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14::jsonb,$15,$16,'builtin')
           ON CONFLICT (id) DO UPDATE SET
             vendor = EXCLUDED.vendor, model = EXCLUDED.model, device_type = EXCLUDED.device_type,
             protocol = EXCLUDED.protocol, integration = EXCLUDED.integration, description = EXCLUDED.description,
             default_name = EXCLUDED.default_name, default_unit = EXCLUDED.default_unit, fields = EXCLUDED.fields,
             rtsp_templates = EXCLUDED.rtsp_templates, steps = EXCLUDED.steps, snippets = EXCLUDED.snippets,
             links = EXCLUDED.links, notes = EXCLUDED.notes, tags = EXCLUDED.tags, updated_at = now()
           WHERE device_profiles.source = 'builtin'`,
          [
            p.id, p.vendor, p.model, p.device_type, p.protocol, p.integration, p.description, p.default_name, p.default_unit,
            JSON.stringify(p.fields), JSON.stringify(p.rtsp_templates), JSON.stringify(p.steps),
            JSON.stringify(p.snippets), JSON.stringify(p.links), p.notes, p.tags,
          ],
        );
      }
      this.logger.log(`โหลดแคตตาล็อกอุปกรณ์ builtin ${BUILTIN_PROFILES.length} รุ่น`);
    } catch (err) {
      this.logger.error(`โหลดแคตตาล็อกอุปกรณ์ไม่สำเร็จ (รัน migration แล้วหรือยัง?): ${(err as Error).message}`);
    }
  }

  async list(opts: { type?: string; q?: string; includeDisabled?: boolean }): Promise<DeviceProfile[]> {
    const qb = this.profiles.createQueryBuilder('p').orderBy('p.device_type', 'ASC').addOrderBy('p.vendor', 'ASC').addOrderBy('p.model', 'ASC');
    if (!opts.includeDisabled) qb.andWhere('p.enabled = true');
    if (opts.type) qb.andWhere('p.device_type = :t', { t: opts.type });
    if (opts.q?.trim()) {
      qb.andWhere(`(p.vendor ILIKE :q OR p.model ILIKE :q OR p.description ILIKE :q OR array_to_string(p.tags, ' ') ILIKE :q)`, {
        q: `%${opts.q.trim().replace(/[%_]/g, '')}%`,
      });
    }
    return qb.getMany();
  }

  async get(id: string, includeDisabled = false): Promise<DeviceProfile> {
    const p = await this.profiles.findOne({ where: { id } });
    if (!p || (!p.enabled && !includeDisabled)) throw new NotFoundException('ไม่พบโปรไฟล์อุปกรณ์นี้');
    return p;
  }

  async create(dto: CreateProfileDto): Promise<DeviceProfile> {
    if (await this.profiles.exist({ where: { id: dto.id } })) throw new BadRequestException('มีรหัสโปรไฟล์นี้อยู่แล้ว');
    return this.profiles.save(
      this.profiles.create({
        id: dto.id,
        vendor: dto.vendor,
        model: dto.model,
        device_type: dto.device_type,
        protocol: dto.protocol,
        integration: dto.integration,
        description: dto.description ?? '',
        default_name: dto.default_name ?? '',
        default_unit: dto.default_unit ?? null,
        fields: dto.fields ?? [],
        rtsp_templates: dto.rtsp_templates ?? [],
        steps: dto.steps ?? [],
        snippets: dto.snippets ?? [],
        links: dto.links ?? [],
        notes: dto.notes ?? '',
        tags: dto.tags ?? [],
        source: 'custom',
        enabled: true,
      }),
    );
  }

  /** builtin แก้ได้เฉพาะเปิด/ปิด (ต้องการปรับเนื้อหา ให้สร้างโปรไฟล์ custom ใหม่) */
  async update(id: string, dto: UpdateProfileDto): Promise<DeviceProfile> {
    const p = await this.get(id, true);
    const { enabled, ...content } = dto;
    if (p.source === 'builtin' && Object.keys(content).length > 0) {
      throw new ForbiddenException('แก้เนื้อหาโปรไฟล์ที่มากับระบบไม่ได้ (เปิด/ปิดได้เท่านั้น) — สร้างเป็นโปรไฟล์ใหม่แทน');
    }
    Object.assign(p, Object.fromEntries(Object.entries(content).filter(([, v]) => v !== undefined)));
    if (enabled !== undefined) p.enabled = enabled;
    return this.profiles.save(p);
  }

  async remove(id: string): Promise<void> {
    const p = await this.get(id, true);
    if (p.source === 'builtin') throw new ForbiddenException('ลบโปรไฟล์ที่มากับระบบไม่ได้ (ปิดการใช้งานแทนได้)');
    await this.profiles.delete({ id });
  }
}
