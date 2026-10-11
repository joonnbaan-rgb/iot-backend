import { Body, Controller, ForbiddenException, Headers, HttpCode, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'crypto';
import { Public } from '../auth/decorators/public.decorator';
import { NotificationsService } from './notifications.service';

interface AlertmanagerPayload {
  status?: string;
  alerts?: {
    status?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
    startsAt?: string;
  }[];
}

/**
 * รับ webhook จาก Alertmanager (เครือข่าย docker เท่านั้น: Caddy ปิด /internal* จากอินเทอร์เน็ต)
 * ยืนยันด้วย INTERNAL_AUTH_TOKEN ผ่านหัว Authorization: Bearer (หรือ ?t= เพื่อทดสอบด้วยมือ)
 * แล้วส่งต่อให้ผู้ดูแลระบบทางช่องทางที่ผูกไว้ในแอป
 */
@Public()
@SkipThrottle()
@Controller('internal/alerts')
export class AlertWebhookController {
  constructor(
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  private assertInternal(auth?: string, t?: string): void {
    const expected = this.config.get<string>('INTERNAL_AUTH_TOKEN');
    const given = auth?.startsWith('Bearer ') ? auth.slice(7) : (t ?? '');
    const a = Buffer.from(given);
    const b = Buffer.from(expected ?? '');
    if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) throw new ForbiddenException();
  }

  @Post()
  @HttpCode(200)
  async receive(
    @Headers('authorization') auth: string | undefined,
    @Query('t') t: string | undefined,
    @Body() body: AlertmanagerPayload,
  ) {
    this.assertInternal(auth, t);
    const alerts = Array.isArray(body?.alerts) ? body.alerts.slice(0, 20) : [];
    if (alerts.length === 0) return { ok: true, sent: 0 };

    const lines = alerts.map((a) => {
      const name = a.labels?.alertname ?? 'alert';
      const sev = a.labels?.severity ?? 'warning';
      const summary = a.annotations?.summary ?? '';
      if (a.status === 'resolved') return `✅ แก้ไขแล้ว: ${name}${summary ? ` — ${summary}` : ''}`;
      return `${sev === 'critical' ? '🔴 วิกฤต' : '🟠 เตือน'}: ${name}${summary ? ` — ${summary}` : ''}`;
    });
    const critical = alerts.some((a) => a.status !== 'resolved' && a.labels?.severity === 'critical');
    await this.notifications.notifySystem(`⚠️ ระบบ IoT\n${lines.join('\n')}`.slice(0, 1500), critical);
    return { ok: true, sent: alerts.length };
  }
}
