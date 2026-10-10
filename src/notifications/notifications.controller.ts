import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { NotificationsService } from './notifications.service';
import { ChannelLinkService } from './channel-link.service';
import { TelegramService } from './telegram.service';
import { LineService } from './line.service';
import { EmailService } from './email.service';
import { NotificationChannel } from './entities/notification-channel.entity';
import { ALL_EVENTS, NotificationSettings } from './entities/notification-settings.entity';
import { UpdateChannelDto, UpdateSettingsDto } from './dto/settings.dto';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';

// ทุก endpoint ในนี้ต้อง login จึงใช้ UserThrottlerGuard (แยกตาม user) แทน IP-based guard
@SkipThrottle()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly links: ChannelLinkService,
    private readonly telegram: TelegramService,
    private readonly line: LineService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    @InjectRepository(NotificationChannel) private readonly channels: Repository<NotificationChannel>,
    @InjectRepository(NotificationSettings) private readonly settings: Repository<NotificationSettings>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  /** ประวัติแจ้งเตือนของผู้ใช้เอง (admin เห็นทั้งระบบ) */
  @Get()
  findRecent(@CurrentUser() user: CurrentUserPayload, @Query('limit') limit?: string) {
    const n = limit ? parseInt(limit, 10) : undefined;
    return this.notificationsService.findRecentFor(user.role === UserRole.ADMIN ? null : user.sub, n);
  }

  @Get('settings')
  async getSettings(@CurrentUser() user: CurrentUserPayload) {
    const [s, channels, account] = await Promise.all([
      this.notificationsService.settingsOf(user.sub),
      this.channels.find({ where: { user_id: user.sub }, order: { created_at: 'ASC' } }),
      this.users.findOne({ where: { id: user.sub }, select: { id: true, email: true } }),
    ]);
    return {
      providers: {
        telegram: this.telegram.hasBot(),
        line: this.line.isConfigured(),
        email: this.email.isConfigured(),
      },
      account_email: account?.email ?? null,
      all_events: ALL_EVENTS,
      events: s.events,
      quiet_start: s.quiet_start,
      quiet_end: s.quiet_end,
      channels: channels.map((c) => ({
        id: c.id,
        type: c.type,
        label: c.label ?? c.target,
        enabled: c.enabled,
      })),
    };
  }

  @Put('settings')
  async updateSettings(@CurrentUser() user: CurrentUserPayload, @Body() dto: UpdateSettingsDto) {
    const cur = await this.notificationsService.settingsOf(user.sub);
    const start = dto.quiet_start !== undefined ? dto.quiet_start : cur.quiet_start;
    const end = dto.quiet_end !== undefined ? dto.quiet_end : cur.quiet_end;
    if ((start == null) !== (end == null)) {
      throw new BadRequestException('ช่วงเวลาเงียบต้องระบุทั้งเวลาเริ่มและเวลาสิ้นสุด (หรือเว้นทั้งคู่เพื่อปิด)');
    }
    cur.events = dto.events ?? cur.events;
    cur.quiet_start = start ?? null;
    cur.quiet_end = end ?? null;
    await this.settings.save(cur);
    return this.getSettings(user);
  }

  /** เพิ่มช่องทางอีเมล: ส่งได้เฉพาะอีเมลของบัญชีตัวเอง (กันใช้ระบบส่งอีเมลหาคนอื่น) */
  @Post('channels/email')
  async addEmail(@CurrentUser() user: CurrentUserPayload) {
    if (!this.email.isConfigured()) throw new BadRequestException('เซิร์ฟเวอร์ยังไม่ได้ตั้งค่าการส่งอีเมล');
    const account = await this.users.findOne({ where: { id: user.sub }, select: { id: true, email: true } });
    if (!account) throw new NotFoundException();
    await this.links.link(user.sub, 'email', account.email, account.email);
    return this.getSettings(user);
  }

  /** ขอรหัสผูก Telegram/LINE: ผู้ใช้ส่งรหัสให้บอต -> ระบบบันทึกช่องทางให้อัตโนมัติ */
  @Post('channels/:type/link-code')
  async linkCode(@CurrentUser() user: CurrentUserPayload, @Param('type') type: string) {
    if (type === 'telegram') {
      if (!this.telegram.hasBot()) throw new BadRequestException('เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า Telegram bot');
      const { code, expires_at } = this.links.create(user.sub, 'telegram');
      const bot = await this.telegram.getBotUsername();
      return {
        code,
        expires_at,
        open_url: bot ? `https://t.me/${bot}?start=${code}` : null,
        instructions: bot
          ? `เปิดบอต @${bot} แล้วกด Start (หรือพิมพ์รหัสนี้ส่งให้บอต) ภายใน 10 นาที`
          : 'ส่งรหัสนี้ให้บอต Telegram ของระบบภายใน 10 นาที',
      };
    }
    if (type === 'line') {
      if (!this.line.isConfigured()) throw new BadRequestException('เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า LINE Messaging API');
      const { code, expires_at } = this.links.create(user.sub, 'line');
      const basic = this.config.get<string>('LINE_BOT_BASIC_ID');
      return {
        code,
        expires_at,
        open_url: basic ? `https://line.me/R/ti/p/${encodeURIComponent(basic)}` : null,
        instructions: 'เพิ่มบัญชี LINE ของระบบเป็นเพื่อน แล้วพิมพ์รหัสนี้ส่งในแชต ภายใน 10 นาที',
      };
    }
    throw new BadRequestException('ช่องทางที่รองรับ: telegram, line');
  }

  @Patch('channels/:id')
  async updateChannel(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateChannelDto,
  ) {
    const res = await this.channels.update({ id, user_id: user.sub }, { enabled: dto.enabled });
    if (!res.affected) throw new NotFoundException('ไม่พบช่องทางนี้');
    return this.getSettings(user);
  }

  @Delete('channels/:id')
  @HttpCode(204)
  async removeChannel(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    const res = await this.channels.delete({ id, user_id: user.sub });
    if (!res.affected) throw new NotFoundException('ไม่พบช่องทางนี้');
  }

  @Post('test')
  @HttpCode(200)
  test(@CurrentUser() user: CurrentUserPayload) {
    return this.notificationsService.sendTest(user.sub);
  }
}
