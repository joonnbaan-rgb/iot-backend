import { Body, Controller, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { DiscoveryService } from './discovery.service';
import { ScanDto } from './dto/scan.dto';

@SkipThrottle()
@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  // ผู้ใช้ที่ login แล้วทุกคนสแกนหาอุปกรณ์ในวง LAN ที่เซิร์ฟเวอร์อยู่ได้ (ใช้ตอนเพิ่มอุปกรณ์)
  @Post('scan')
  scan(@CurrentUser() user: CurrentUserPayload, @Body() dto: ScanDto) {
    return this.discovery.scan(user.sub, dto.subnet);
  }
}
