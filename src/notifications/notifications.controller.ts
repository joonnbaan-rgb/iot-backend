import { Controller, Get, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { NotificationsService } from './notifications.service';

// ทุก endpoint ในนี้ต้อง login จึงใช้ UserThrottlerGuard (แยกตาม user) แทน IP-based guard
@SkipThrottle()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findRecent(@Query('limit') limit?: string) {
    return this.notificationsService.findRecent(limit ? parseInt(limit, 10) : undefined);
  }
}
