import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * โทเคนสั้นๆ ฝังใน path ของ HLS: /s/{exp}-{sig}/{deviceId}/index.m3u8
 * sig = HMAC-SHA256(secret, `${deviceId}.${exp}`) ทุกคำขอ (playlist และ segment) ถูก Caddy ส่งมาตรวจที่ backend
 * ไม่ตั้ง STREAM_TOKEN_SECRET = ปิดฟีเจอร์ (ใช้ URL ตรงเหมือนตอนพัฒนา)
 */
@Injectable()
export class StreamTokenService {
  constructor(private readonly config: ConfigService) {}

  private get secret(): string | undefined {
    return this.config.get<string>('STREAM_TOKEN_SECRET') || undefined;
  }

  get enabled(): boolean {
    return !!this.secret;
  }

  private sig(deviceId: string, exp: number): string {
    return createHmac('sha256', this.secret as string).update(`${deviceId}.${exp}`).digest('hex');
  }

  sign(deviceId: string): string {
    const ttl = parseInt(this.config.get<string>('STREAM_TOKEN_TTL_SECONDS', '43200'), 10);
    const exp = Math.floor(Date.now() / 1000) + ttl;
    return `${exp}-${this.sig(deviceId, exp)}`;
  }

  verify(token: string, deviceId: string): boolean {
    if (!this.secret) return false;
    const m = /^(\d{1,12})-([0-9a-f]{64})$/.exec(token);
    if (!m) return false;
    const exp = Number(m[1]);
    if (exp < Math.floor(Date.now() / 1000)) return false;
    const a = Buffer.from(m[2], 'hex');
    const b = Buffer.from(this.sig(deviceId, exp), 'hex');
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
