import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * ส่งอีเมลผ่าน Resend HTTP API (https://resend.com) ไม่ต้องพึ่งไลบรารี SMTP
 * ตั้ง RESEND_API_KEY และ EMAIL_FROM (โดเมนที่ยืนยันกับ Resend แล้ว เช่น "IoT <alerts@example.com>")
 */
@Injectable()
export class EmailService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return !!this.config.get<string>('RESEND_API_KEY') && !!this.config.get<string>('EMAIL_FROM');
  }

  async send(to: string, subject: string, text: string): Promise<void> {
    if (!this.isConfigured()) throw new Error('ยังไม่ได้ตั้งค่า RESEND_API_KEY/EMAIL_FROM');
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.get<string>('RESEND_API_KEY')}`,
      },
      body: JSON.stringify({ from: this.config.get<string>('EMAIL_FROM'), to: [to], subject, text }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Email API ตอบกลับ ${res.status}: ${body}`);
    }
  }
}
