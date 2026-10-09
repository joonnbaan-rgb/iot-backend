import { Controller, Get, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { NotificationsService } from './notifications.service';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

// ทุก endpoint ในนี้ต้อง login จึงใช้ UserThrottlerGuard (แยกตาม user) แทน IP-based guard
@SkipThrottle()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findRecent(@CurrentUser() user: CurrentUserPayload, @Query('limit') limit?: string) {
    // บันทึกการแจ้งเตือนยังเป็นของ "ระบบ" ทั้งหมด (ข้อความอ้างอิงอุปกรณ์ของทุกคน) จึงให้เฉพาะ admin เห็น
    // ผู้ใช้ทั่วไปได้รายการว่างไปก่อน จนกว่าจะแยกการแจ้งเตือนรายผู้ใช้
    if (user.role !== UserRole.ADMIN) return [];
    return this.notificationsService.findRecent(limit ? parseInt(limit, 10) : undefined);
  }
}
