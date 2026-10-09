import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { CamerasService } from './cameras.service';
import { RecordingsService } from './recordings.service';
import { SetCameraSourceDto } from './dto/set-camera-source.dto';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { DeviceAccessService } from '../device-access/device-access.service';

// ทุก endpoint ในนี้ต้อง login จึงใช้ UserThrottlerGuard (แยกตาม user) แทน IP-based guard
@SkipThrottle()
@Controller('devices/:deviceId/camera')
export class CamerasController {
  constructor(
    private readonly camerasService: CamerasService,
    private readonly recordingsService: RecordingsService,
    private readonly access: DeviceAccessService,
  ) {}

  @Put()
  async setSource(
    @CurrentUser() user: CurrentUserPayload,
    @Param('deviceId') deviceId: string,
    @Body() dto: SetCameraSourceDto,
  ) {
    await this.access.assert(user, deviceId, 'manage');
    return this.camerasService.setSource(deviceId, dto.rtsp_url);
  }

  @Get('stream')
  async getStreamUrls(@CurrentUser() user: CurrentUserPayload, @Param('deviceId') deviceId: string) {
    await this.access.assert(user, deviceId, 'view');
    return this.camerasService.getStreamUrls(deviceId);
  }

  @Get('recordings')
  async listRecordings(
    @CurrentUser() user: CurrentUserPayload,
    @Param('deviceId') deviceId: string,
    @Query('limit') limit?: string,
  ) {
    await this.access.assert(user, deviceId, 'view');
    return this.recordingsService.listRecordings(deviceId, limit ? parseInt(limit, 10) : undefined);
  }
}
