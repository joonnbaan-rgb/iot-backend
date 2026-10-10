import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

/** LINE Messaging API (แทน LINE Notify ที่ปิดบริการแล้ว): ต้องสร้าง Messaging API channel เอง */
@Injectable()
export class LineService {
  constructor(private readonly config: ConfigService) {}

  private get accessToken(): string | undefined {
    return this.config.get<string>('LINE_CHANNEL_ACCESS_TOKEN') || undefined;
  }

  private get secret(): string | undefined {
    return this.config.get<string>('LINE_CHANNEL_SECRET') || undefined;
  }

  isConfigured(): boolean {
    return !!this.accessToken && !!this.secret;
  }

  /** ตรวจลายเซ็น webhook: base64(HMAC-SHA256(channelSecret, rawBody)) */
  verifySignature(rawBody: Buffer | undefined, signature: string | undefined): boolean {
    if (!this.secret || !rawBody || !signature) return false;
    const expected = createHmac('sha256', this.secret).update(rawBody).digest();
    let given: Buffer;
    try {
      given = Buffer.from(signature, 'base64');
    } catch {
      return false;
    }
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  private async post(path: string, body: Record<string, unknown>): Promise<void> {
    if (!this.accessToken) throw new Error('ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN');
    const res = await fetch(`https://api.line.me/v2/bot/message/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.accessToken}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LINE API ตอบกลับ ${res.status}: ${text}`);
    }
  }

  push(userId: string, text: string): Promise<void> {
    return this.post('push', { to: userId, messages: [{ type: 'text', text: text.slice(0, 4900) }] });
  }

  reply(replyToken: string, text: string): Promise<void> {
    return this.post('reply', { replyToken, messages: [{ type: 'text', text }] });
  }
}
