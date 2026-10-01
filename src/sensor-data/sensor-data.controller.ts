import { Controller, Get, Param, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { SensorDataService } from './sensor-data.service';

// ทุก endpoint ในนี้ต้อง login จึงใช้ UserThrottlerGuard (แยกตาม user) แทน IP-based guard
@SkipThrottle()
@Controller('devices/:deviceId/telemetry')
export class SensorDataController {
  constructor(private readonly sensorDataService: SensorDataService) {}

  @Get()
  findByDevice(
    @Param('deviceId') deviceId: string,
    @Query('limit') limit?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.sensorDataService.findByDevice(deviceId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }
}
