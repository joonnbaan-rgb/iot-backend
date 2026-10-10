import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { UserRole, User } from '../users/entities/user.entity';
import { DeviceAccessService } from '../device-access/device-access.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { Site } from './entities/site.entity';
import { SiteMember, SiteRole } from './entities/site-member.entity';
import { AddMemberDto, CreateSiteDto, UpdateMemberDto, UpdateSiteDto } from './dto/site.dto';

export interface SiteView extends Site {
  my_role: SiteRole;
  member_count: number;
  device_count: number;
}

export interface MemberView {
  user_id: string;
  email: string;
  role: SiteRole;
  created_at: Date;
}

@Injectable()
export class SitesService {
  constructor(
    @InjectRepository(Site) private readonly sites: Repository<Site>,
    @InjectRepository(SiteMember) private readonly members: Repository<SiteMember>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly access: DeviceAccessService,
    private readonly gateway: RealtimeGateway,
  ) {}

  /** role ของผู้ใช้ในไซต์ (global admin ถือเป็น admin ของทุกไซต์) null = ไม่ใช่สมาชิก */
  private async roleOf(user: CurrentUserPayload, siteId: string): Promise<SiteRole | null> {
    if (user.role === UserRole.ADMIN) return 'admin';
    const m = await this.members.findOne({ where: { site_id: siteId, user_id: user.sub } });
    return m?.role ?? null;
  }

  /** ตรวจว่าเป็นสมาชิก (404 ถ้าไม่ใช่) และถ้าต้องการ admin แล้วไม่ใช่ -> 403 */
  async assertRole(user: CurrentUserPayload, siteId: string, need: 'member' | 'admin'): Promise<Site> {
    const site = await this.sites.findOne({ where: { id: siteId } });
    if (!site) throw new NotFoundException('ไม่พบไซต์');
    const role = await this.roleOf(user, siteId);
    if (!role) throw new NotFoundException('ไม่พบไซต์');
    if (need === 'admin' && role !== 'admin') throw new ForbiddenException('ต้องเป็นผู้ดูแลไซต์นี้');
    return site;
  }

  async list(user: CurrentUserPayload): Promise<SiteView[]> {
    const isAdmin = user.role === UserRole.ADMIN;
    const rows: (Site & { my_role: SiteRole | null; member_count: string; device_count: string })[] =
      await this.sites.query(
        `SELECT s.*, m.role AS my_role,
                (SELECT COUNT(*) FROM site_members x WHERE x.site_id = s.id) AS member_count,
                (SELECT COUNT(*) FROM devices d WHERE d.site_id = s.id) AS device_count
           FROM sites s LEFT JOIN site_members m ON m.site_id = s.id AND m.user_id = $1
          WHERE ($2::boolean OR m.user_id IS NOT NULL)
          ORDER BY s.is_personal DESC, s.created_at ASC`,
        [user.sub, isAdmin],
      );
    return rows.map((r) => ({
      ...r,
      my_role: isAdmin ? 'admin' : (r.my_role as SiteRole),
      member_count: Number(r.member_count),
      device_count: Number(r.device_count),
    }));
  }

  async create(user: CurrentUserPayload, dto: CreateSiteDto): Promise<Site> {
    return this.sites.manager.transaction(async (m) => {
      const site = await m.getRepository(Site).save(
        m.getRepository(Site).create({ name: dto.name.trim(), kind: dto.kind, created_by: user.sub }),
      );
      await m.getRepository(SiteMember).save({ site_id: site.id, user_id: user.sub, role: 'admin' });
      return site;
    });
  }

  async update(user: CurrentUserPayload, id: string, dto: UpdateSiteDto): Promise<Site> {
    const site = await this.assertRole(user, id, 'admin');
    if (dto.name !== undefined) site.name = dto.name.trim();
    if (dto.kind !== undefined) site.kind = dto.kind;
    return this.sites.save(site);
  }

  async remove(user: CurrentUserPayload, id: string): Promise<void> {
    const site = await this.assertRole(user, id, 'admin');
    if (site.is_personal) throw new BadRequestException('ลบไซต์ส่วนตัวไม่ได้');
    const [{ count }] = await this.sites.query(`SELECT COUNT(*)::int AS count FROM devices WHERE site_id = $1`, [id]);
    if (count > 0) throw new ConflictException('ไซต์นี้ยังมีอุปกรณ์ ย้ายอุปกรณ์ออกก่อนจึงจะลบได้');
    const memberIds = (await this.members.find({ where: { site_id: id } })).map((x) => x.user_id);
    await this.sites.delete(id);
    await this.afterChange(memberIds);
  }

  // ---------- สมาชิก ----------

  async listMembers(user: CurrentUserPayload, siteId: string): Promise<MemberView[]> {
    await this.assertRole(user, siteId, 'member');
    return this.members.query(
      `SELECT m.user_id, u.email, m.role, m.created_at
         FROM site_members m JOIN users u ON u.id = m.user_id
        WHERE m.site_id = $1 ORDER BY m.created_at ASC`,
      [siteId],
    );
  }

  async addMember(user: CurrentUserPayload, siteId: string, dto: AddMemberDto): Promise<MemberView[]> {
    await this.assertRole(user, siteId, 'admin');
    const target = await this.users.findOne({ where: { email: dto.email.trim().toLowerCase() } });
    if (!target) throw new NotFoundException('ไม่พบผู้ใช้อีเมลนี้ (ต้องสมัครสมาชิกก่อน)');
    await this.members.query(
      `INSERT INTO site_members (site_id, user_id, role) VALUES ($1,$2,$3)
       ON CONFLICT (site_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [siteId, target.id, dto.role],
    );
    await this.afterChange([target.id]);
    return this.listMembers(user, siteId);
  }

  async updateMember(
    user: CurrentUserPayload,
    siteId: string,
    userId: string,
    dto: UpdateMemberDto,
  ): Promise<MemberView[]> {
    await this.assertRole(user, siteId, 'admin');
    const m = await this.members.findOne({ where: { site_id: siteId, user_id: userId } });
    if (!m) throw new NotFoundException('ไม่พบสมาชิก');
    if (m.role === 'admin' && dto.role !== 'admin') await this.assertNotLastAdmin(siteId);
    m.role = dto.role;
    await this.members.save(m);
    await this.afterChange([userId]);
    return this.listMembers(user, siteId);
  }

  async removeMember(user: CurrentUserPayload, siteId: string, userId: string): Promise<void> {
    // สมาชิกออกจากไซต์เองได้ แม้ไม่ใช่ admin
    if (userId === user.sub) await this.assertRole(user, siteId, 'member');
    else await this.assertRole(user, siteId, 'admin');
    const m = await this.members.findOne({ where: { site_id: siteId, user_id: userId } });
    if (!m) throw new NotFoundException('ไม่พบสมาชิก');
    const site = await this.sites.findOne({ where: { id: siteId } });
    if (site?.is_personal && site.created_by === userId) {
      throw new BadRequestException('ออกจากไซต์ส่วนตัวของตัวเองไม่ได้');
    }
    if (m.role === 'admin') await this.assertNotLastAdmin(siteId);
    await this.members.delete({ site_id: siteId, user_id: userId });
    await this.afterChange([userId]);
  }

  private async assertNotLastAdmin(siteId: string): Promise<void> {
    const admins = await this.members.count({ where: { site_id: siteId, role: 'admin' } });
    if (admins <= 1) throw new BadRequestException('ไซต์ต้องมีผู้ดูแลอย่างน้อย 1 คน');
  }

  /** หลังสิทธิ์ใครเปลี่ยน: ลบ rule เกินสิทธิ์, ปรับห้อง socket, แจ้งแอปให้รีเฟรช */
  private async afterChange(userIds: string[]): Promise<void> {
    await this.access.pruneRules();
    for (const id of new Set(userIds)) {
      await this.gateway.revalidateUser(id);
      this.gateway.emitToUser(id, 'shares:changed');
    }
  }
}
