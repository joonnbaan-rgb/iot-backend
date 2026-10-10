import { Controller, Get, Param, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { SensorDataService } from './sensor-data.service';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { DeviceAccessService } from '../device-access/device-access.service';

// ทุก endpoint ในนี้ต้อง login จึงใช้ UserThrottlerGuard (แยกตาม user) แทน IP-based guard
@SkipThrottle()
@Controller('devices/:deviceId/telemetry')
export class SensorDataController {
  constructor(
    private readonly sensorDataService: SensorDataService,
    private readonly access: DeviceAccessService,
  ) {}

  @Get()
  async findByDevice(
    @CurrentUser() user: CurrentUserPayload,
    @Param('deviceId') deviceId: string,
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    await this.access.assert(user, deviceId, 'view');
    return this.sensorDataService.findByDevice(deviceId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  /** สรุปเป็นช่วงเวลา (avg/min/max) สำหรับกราฟ — เร็วกว่าดึงข้อมูลดิบเมื่อช่วงเวลายาว */
  @Get('summary')
  async summary(
    @CurrentUser() user: CurrentUserPayload,
    @Param('deviceId') deviceId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('bucket') bucket?: string,
  ) {
    await this.access.assert(user, deviceId, 'view');
    return this.sensorDataService.summary(deviceId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      bucket,
    });
  }
}
