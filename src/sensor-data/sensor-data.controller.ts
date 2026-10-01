import { Controller, Get, Param, Query } from '@nestjs/common';
import { SensorDataService } from './sensor-data.service';

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
