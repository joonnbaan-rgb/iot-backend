import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DevicesService } from './devices.service';
import { CreateDeviceDto } from './dto/create-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';

// ทุก endpoint ในนี้ต้อง login (ไม่มี @Public()) จึงใช้ UserThrottlerGuard
// (จำกัดโควตาแยกตาม user) แทน global IP-based ThrottlerGuard
@SkipThrottle()
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  // คืนเฉพาะอุปกรณ์ที่ผู้ใช้มองเห็น (ของตัวเอง; admin เห็นทั้งหมด) พร้อม access_level
  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.devicesService.listFor(user);
  }

  @Get(':id')
  findOne(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.devicesService.getFor(user, id);
  }

  // ผู้ใช้ทุกคนเพิ่มอุปกรณ์ของตัวเองได้ (อุปกรณ์จะมี owner_id = ผู้เรียก)
  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateDeviceDto) {
    return this.devicesService.createFor(user, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeviceDto,
  ) {
    return this.devicesService.updateFor(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.devicesService.removeFor(user, id);
  }

  // ออก/เปลี่ยนรหัส MQTT ของอุปกรณ์ (แสดงรหัสครั้งเดียว) และเพิกถอน
  @Post(':id/mqtt-credentials')
  issueMqtt(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.devicesService.issueMqttCredentials(user, id);
  }

  @Delete(':id/mqtt-credentials')
  @HttpCode(204)
  async revokeMqtt(@CurrentUser() user: CurrentUserPayload, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.devicesService.revokeMqttCredentials(user, id);
  }
}
