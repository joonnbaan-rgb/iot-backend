import { Controller, ForbiddenException, Headers, HttpCode, Post, RawBodyRequest, Req } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { ChannelLinkService } from './channel-link.service';
import { LineService } from './line.service';

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type: string; text?: string };
}

/** Webhook ของ LINE Messaging API: ตั้ง URL เป็น https://api.<โดเมน>/integrations/line/webhook ใน LINE Developers Console */
@Public()
@SkipThrottle()
@Controller('integrations/line')
export class LineWebhookController {
  constructor(
    private readonly line: LineService,
    private readonly links: ChannelLinkService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(@Req() req: RawBodyRequest<Request>, @Headers('x-line-signature') signature?: string) {
    if (!this.line.verifySignature(req.rawBody, signature)) throw new ForbiddenException();
    const events: LineEvent[] = (req.body as { events?: LineEvent[] })?.events ?? [];
    for (const ev of events) {
      if (ev.type !== 'message' || ev.message?.type !== 'text' || !ev.source?.userId) continue;
      const text = (ev.message.text ?? '').trim();
      const userId = /^[A-Za-z0-9]{6}$/.test(text) ? this.links.consume(text, 'line') : null;
      let reply: string;
      if (userId) {
        await this.links.link(userId, 'line', ev.source.userId);
        reply = '✅ เชื่อมต่อการแจ้งเตือนสำเร็จ จากนี้จะได้รับแจ้งเตือนจากอุปกรณ์ของคุณที่นี่';
      } else {
        reply = 'พิมพ์รหัส 6 หลักจากแอปเพื่อเชื่อมต่อการแจ้งเตือน (รหัสอายุ 10 นาที)';
      }
      if (ev.replyToken) await this.line.reply(ev.replyToken, reply).catch(() => undefined);
    }
    return { ok: true };
  }
}
