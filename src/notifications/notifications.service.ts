import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { NotificationLog, NotificationStatus } from './entities/notification-log.entity';
import { NotificationChannel } from './entities/notification-channel.entity';
import { ALL_EVENTS, NotificationSettings } from './entities/notification-settings.entity';
import { TelegramService } from './telegram.service';
import { LineService } from './line.service';
import { EmailService } from './email.service';
import { DeviceAccessService } from '../device-access/device-access.service';

const EVENT_TH: Record<string, string> = {
  device_offline: 'อุปกรณ์ออฟไลน์',
  rule_triggered: 'กฎทำงาน',
  command_timeout: 'คำสั่งหมดเวลา',
};

export interface NotifyOptions {
  /** อุปกรณ์ที่เกี่ยวข้อง: ผู้มีสิทธิ์เห็นอุปกรณ์นี้ (เจ้าของ/ผู้ถูกแชร์/สมาชิกไซต์) จะเป็นผู้รับ */
  deviceId?: string;
  /** ผู้รับเพิ่มเติม เช่น เจ้าของ rule */
  userIds?: string[];
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(NotificationLog) private readonly logRepository: Repository<NotificationLog>,
    @InjectRepository(NotificationChannel) private readonly channelRepository: Repository<NotificationChannel>,
    @InjectRepository(NotificationSettings) private readonly settingsRepository: Repository<NotificationSettings>,
    private readonly telegram: TelegramService,
    private readonly line: LineService,
    private readonly email: EmailService,
    private readonly access: DeviceAccessService,
    private readonly config: ConfigService,
  ) {}

  /**
   * แจ้งเตือนผู้ที่เกี่ยวข้อง: บันทึกในแอปเสมอ แล้วส่งต่อ Telegram/LINE/Email ตามที่ผู้ใช้เปิดไว้
   * (เคารพ "เหตุการณ์ที่ต้องการ" และ "ช่วงเวลาเงียบ" ของแต่ละคน) ไม่ throw: แจ้งเตือนพังต้องไม่ทำให้ระบบหลักพัง
   */
  async notify(eventType: string, message: string, opts: NotifyOptions = {}): Promise<void> {
    try {
      const recipients = new Set<string>(opts.userIds ?? []);
      if (opts.deviceId) {
        for (const id of await this.access.audienceUserIds(opts.deviceId)) recipients.add(id);
      }
      for (const userId of recipients) {
        await this.deliver(userId, eventType, message).catch((err) =>
          this.logger.error(`แจ้งเตือน user ${userId} ล้มเหลว: ${err.message}`),
        );
      }
      await this.notifyLegacyChat(eventType, message);
    } catch (err) {
      this.logger.error(`notify(${eventType}) ล้มเหลว: ${(err as Error).message}`);
    }
  }

  /** ช่องทางระบบกลางแบบเดิม: ถ้าตั้ง TELEGRAM_CHAT_ID ใน .env จะส่งทุกเหตุการณ์เข้า chat นั้น */
  private async notifyLegacyChat(eventType: string, message: string): Promise<void> {
    if (!this.telegram.isConfigured()) return;
    await this.sendAndLog(null, 'telegram', eventType, message, () => this.telegram.sendMessage(message));
  }

  private async deliver(userId: string, eventType: string, message: string): Promise<void> {
    const settings = await this.settingsOf(userId);
    if (!settings.events.includes(eventType)) return;

    // ในแอป: เก็บประวัติเสมอ
    await this.logRepository.save(
      this.logRepository.create({
        user_id: userId,
        channel: 'app',
        event_type: eventType,
        message,
        status: NotificationStatus.SENT,
      }),
    );
    if (this.inQuietHours(settings)) return;

    const channels = await this.channelRepository.find({ where: { user_id: userId, enabled: true } });
    for (const ch of channels) {
      await this.sendAndLog(userId, ch.type, eventType, message, () => this.dispatch(ch, eventType, message));
    }
  }

  private dispatch(ch: NotificationChannel, eventType: string, message: string): Promise<void> {
    switch (ch.type) {
      case 'telegram':
        return this.telegram.sendTo(ch.target, message);
      case 'line':
        return this.line.push(ch.target, message);
      case 'email':
        return this.email.send(ch.target, `[IoT] ${EVENT_TH[eventType] ?? eventType}`, message);
    }
  }

  private async sendAndLog(
    userId: string | null,
    channel: string,
    eventType: string,
    message: string,
    send: () => Promise<void>,
  ): Promise<void> {
    let status = NotificationStatus.SENT;
    let error: string | null = null;
    try {
      await send();
    } catch (err) {
      status = NotificationStatus.FAILED;
      error = (err as Error).message;
      this.logger.error(`ส่งแจ้งเตือนทาง ${channel} ล้มเหลว (${eventType}): ${error}`);
    }
    await this.logRepository.save(
      this.logRepository.create({ user_id: userId, channel, event_type: eventType, message, status, error }),
    );
  }

  /** ทดสอบส่งไปทุกช่องทางที่เปิดอยู่ของผู้ใช้ (ไม่สน quiet hours) คืนผลรายช่องทาง */
  async sendTest(userId: string): Promise<{ channel: string; target: string; ok: boolean; error?: string }[]> {
    const channels = await this.channelRepository.find({ where: { user_id: userId, enabled: true } });
    const out: { channel: string; target: string; ok: boolean; error?: string }[] = [];
    for (const ch of channels) {
      try {
        await this.dispatch(ch, 'test', '🔔 ทดสอบการแจ้งเตือนจากระบบ IoT — ถ้าเห็นข้อความนี้ แสดงว่าตั้งค่าสำเร็จ');
        out.push({ channel: ch.type, target: ch.label ?? ch.target, ok: true });
      } catch (err) {
        out.push({ channel: ch.type, target: ch.label ?? ch.target, ok: false, error: (err as Error).message });
      }
    }
    return out;
  }

  // ----- ตั้งค่าผู้ใช้ -----

  async settingsOf(userId: string): Promise<NotificationSettings> {
    return (
      (await this.settingsRepository.findOne({ where: { user_id: userId } })) ??
      this.settingsRepository.create({ user_id: userId, events: [...ALL_EVENTS], quiet_start: null, quiet_end: null })
    );
  }

  private inQuietHours(s: NotificationSettings): boolean {
    if (s.quiet_start == null || s.quiet_end == null || s.quiet_start === s.quiet_end) return false;
    const tz = this.config.get<string>('NOTIFY_TZ', 'Asia/Bangkok');
    const hour =
      Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(new Date())) % 24;
    return s.quiet_start < s.quiet_end
      ? hour >= s.quiet_start && hour < s.quiet_end
      : hour >= s.quiet_start || hour < s.quiet_end;
  }

  findRecentFor(userId: string | null, limit = 50): Promise<NotificationLog[]> {
    return this.logRepository.find({
      where: userId ? { user_id: userId } : {},
      order: { created_at: 'DESC' },
      take: Math.min(limit, 200),
    });
  }
}
