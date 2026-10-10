import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TelegramUpdate {
  update_id: number;
  message?: { chat: { id: number; first_name?: string; username?: string }; text?: string };
}

@Injectable()
export class TelegramService {
  private botUsername: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  get token(): string | undefined {
    return this.configService.get<string>('TELEGRAM_BOT_TOKEN') || undefined;
  }

  /** บอตพร้อมใช้ (ผูกบัญชีรายผู้ใช้ได้) */
  hasBot(): boolean {
    return !!this.token;
  }

  /** ช่องทางระบบกลางแบบเดิม (ส่งเข้า chat เดียวที่ตั้งใน .env) */
  isConfigured(): boolean {
    return !!this.token && !!this.configService.get<string>('TELEGRAM_CHAT_ID');
  }

  private async call<T>(method: string, body?: Record<string, unknown>): Promise<T> {
    const res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Telegram API ตอบกลับ ${res.status}: ${text}`);
    }
    return ((await res.json()) as { result: T }).result;
  }

  async sendTo(chatId: string, text: string): Promise<void> {
    if (!this.token) throw new Error('ยังไม่ได้ตั้งค่า TELEGRAM_BOT_TOKEN');
    await this.call('sendMessage', { chat_id: chatId, text });
  }

  async sendMessage(text: string): Promise<void> {
    const chatId = this.configService.get<string>('TELEGRAM_CHAT_ID');
    if (!chatId) throw new Error('ยังไม่ได้ตั้งค่า TELEGRAM_CHAT_ID ใน .env');
    await this.sendTo(chatId, text);
  }

  async getBotUsername(): Promise<string | null> {
    if (this.botUsername || !this.token) return this.botUsername;
    try {
      const me = await this.call<{ username?: string }>('getMe');
      this.botUsername = me.username ?? null;
    } catch {
      /* ใช้ลิงก์ลัดไม่ได้ก็ยังผูกด้วยการพิมพ์รหัสได้ */
    }
    return this.botUsername;
  }

  getUpdates(offset: number): Promise<TelegramUpdate[]> {
    return this.call<TelegramUpdate[]>('getUpdates', { offset, timeout: 0, allowed_updates: ['message'] });
  }
}
