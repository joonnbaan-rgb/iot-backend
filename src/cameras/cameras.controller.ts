import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { CamerasService } from './cameras.service';
import { RecordingsService } from './recordings.service';
import { SetCameraSourceDto } from './dto/set-camera-source.dto';

@Controller('devices/:deviceId/camera')
export class CamerasController {
  constructor(
    private readonly camerasService: CamerasService,
    private readonly recordingsService: RecordingsService,
  ) {}

  @Put()
  setSource(@Param('deviceId') deviceId: string, @Body() dto: SetCameraSourceDto) {
    return this.camerasService.setSource(deviceId, dto.rtsp_url);
  }

  @Get('stream')
  getStreamUrls(@Param('deviceId') deviceId: string) {
    return this.camerasService.getStreamUrls(deviceId);
  }

  @Get('recordings')
  listRecordings(@Param('deviceId') deviceId: string, @Query('limit') limit?: string) {
    return this.recordingsService.listRecordings(deviceId, limit ? parseInt(limit, 10) : undefined);
  }
}
