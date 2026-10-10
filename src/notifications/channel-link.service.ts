import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomInt } from 'crypto';
import { ChannelType, NotificationChannel } from './entities/notification-channel.entity';
import { TelegramService } from './telegram.service';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ตัดตัวที่สับสน (0/O, 1/I)
const TTL_MS = 10 * 60 * 1000;
const CODE_RE = /^[A-Z0-9]{6}$/;

interface Pending {
  userId: string;
  type: ChannelType;
  expires: number;
}

/**
 * ผูกบัญชีผู้ใช้กับ Telegram/LINE ด้วยรหัสสั้นอายุ 10 นาที
 * ผู้ใช้ส่งรหัสให้บอต -> เรารู้ chat id / userId ของเขา -> บันทึกเป็นช่องทางแจ้งเตือน
 * (รหัสเก็บในหน่วยความจำ รีสตาร์ตแล้วหาย ผู้ใช้กดขอรหัสใหม่ได้)
 */
@Injectable()
export class ChannelLinkService implements OnModuleDestroy {
  private readonly logger = new Logger(ChannelLinkService.name);
  private readonly pending = new Map<string, Pending>();
  private timer: NodeJS.Timeout | null = null;
  private tgOffset = 0;
  private polling = false;

  constructor(
    @InjectRepository(NotificationChannel) private readonly channels: Repository<NotificationChannel>,
    private readonly telegram: TelegramService,
  ) {}

  create(userId: string, type: ChannelType): { code: string; expires_at: Date } {
    for (const [c, p] of this.pending) {
      if (p.userId === userId && p.type === type) this.pending.delete(c); // หนึ่งรหัสต่อคนต่อช่องทาง
    }
    let code = '';
    do {
      code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    } while (this.pending.has(code));
    const expires = Date.now() + TTL_MS;
    this.pending.set(code, { userId, type, expires });
    if (type === 'telegram') this.startPolling();
    return { code, expires_at: new Date(expires) };
  }

  /** ใช้รหัส (ครั้งเดียว) คืน userId เจ้าของรหัส */
  consume(code: string, type: ChannelType): string | null {
    const c = code.trim().toUpperCase();
    const p = this.pending.get(c);
    if (!p || p.type !== type || p.expires < Date.now()) return null;
    this.pending.delete(c);
    return p.userId;
  }

  async link(userId: string, type: ChannelType, target: string, label?: string): Promise<void> {
    await this.channels
      .createQueryBuilder()
      .insert()
      .values({ user_id: userId, type, target, label: label ?? null, enabled: true })
      .onConflict(`("user_id","type","target") DO UPDATE SET enabled = true, label = EXCLUDED.label`)
      .execute();
  }

  // ----- Telegram: poll getUpdates เฉพาะตอนมีรหัสรอผูกอยู่ (ไม่ต้องตั้ง webhook) -----

  private startPolling(): void {
    if (this.timer || !this.telegram.hasBot()) return;
    this.timer = setInterval(() => void this.pollTelegram(), 3000);
  }

  private stopPolling(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private hasPending(type: ChannelType): boolean {
    const now = Date.now();
    for (const [c, p] of this.pending) {
      if (p.expires < now) this.pending.delete(c);
      else if (p.type === type) return true;
    }
    return false;
  }

  private async pollTelegram(): Promise<void> {
    if (this.polling) return;
    if (!this.hasPending('telegram')) return this.stopPolling();
    this.polling = true;
    try {
      const updates = await this.telegram.getUpdates(this.tgOffset);
      for (const u of updates) {
        this.tgOffset = u.update_id + 1;
        const text = u.message?.text?.trim();
        if (!text || !u.message) continue;
        const m = /^\/start(?:@\w+)?\s+([A-Za-z0-9]{6})$/.exec(text) ?? /^([A-Za-z0-9]{6})$/.exec(text);
        if (!m || !CODE_RE.test(m[1].toUpperCase())) continue;
        const userId = this.consume(m[1], 'telegram');
        const chatId = String(u.message.chat.id);
        if (!userId) {
          await this.telegram.sendTo(chatId, 'รหัสไม่ถูกต้องหรือหมดอายุ กรุณาขอรหัสใหม่ในแอป').catch(() => undefined);
          continue;
        }
        await this.link(userId, 'telegram', chatId, u.message.chat.username ?? u.message.chat.first_name);
        await this.telegram.sendTo(chatId, '✅ เชื่อมต่อการแจ้งเตือนสำเร็จ จากนี้จะได้รับแจ้งเตือนจากอุปกรณ์ของคุณที่นี่').catch(() => undefined);
      }
    } catch (err) {
      this.logger.warn(`poll Telegram ไม่สำเร็จ: ${(err as Error).message}`);
    } finally {
      this.polling = false;
    }
  }

  onModuleDestroy(): void {
    this.stopPolling();
  }
}
