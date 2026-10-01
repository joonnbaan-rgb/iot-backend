import { Controller, Get, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findRecent(@Query('limit') limit?: string) {
    return this.notificationsService.findRecent(limit ? parseInt(limit, 10) : undefined);
  }
}
