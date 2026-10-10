import { Body, Controller, ForbiddenException, Get, Headers, HttpCode, Post, Query, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { timingSafeEqual } from 'crypto';
import { Public } from '../auth/decorators/public.decorator';
import { MqttCredentialsService } from './mqtt-credentials.service';
import { StreamTokenService } from './stream-token.service';

/**
 * endpoint ภายในเครือข่าย docker เท่านั้น (Caddy ปิดไม่ให้เข้าจากอินเทอร์เน็ตที่ /internal*)
 *  - POST /internal/mqtt/authenticate : EMQX เรียกตรวจรหัสอุปกรณ์ (ต้องมี token ร่วมใน query ?t=)
 *  - GET  /internal/stream-auth       : Caddy forward_auth เรียกตรวจโทเคน HLS ทุกคำขอ
 */
@Public()
@SkipThrottle()
@Controller('internal')
export class InternalController {
  constructor(
    private readonly config: ConfigService,
    private readonly creds: MqttCredentialsService,
    private readonly streamTokens: StreamTokenService,
  ) {}

  private assertInternal(token?: string): void {
    const expected = this.config.get<string>('INTERNAL_AUTH_TOKEN');
    const a = Buffer.from(token ?? '');
    const b = Buffer.from(expected ?? '');
    if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException();
    }
  }

  @Post('mqtt/authenticate')
  @HttpCode(200)
  async mqttAuthenticate(
    @Query('t') t: string | undefined,
    @Body() body: { username?: string; password?: string },
  ) {
    this.assertInternal(t);
    const result = await this.creds.check(String(body?.username ?? ''), String(body?.password ?? ''));
    return { result, is_superuser: false };
  }

  @Get('stream-auth')
  streamAuth(@Headers('x-forwarded-uri') uri: string | undefined, @Req() _req: unknown) {
    // รูปแบบ: /s/{token}/{deviceId}/...
    const m = /^\/s\/([^/]+)\/([0-9a-f-]{36})(?:\/|$|\?)/i.exec(uri ?? '');
    if (!m || !this.streamTokens.verify(m[1], m[2].toLowerCase())) {
      throw new ForbiddenException();
    }
    return { ok: true };
  }
}
