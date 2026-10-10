import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from '../devices/entities/device.entity';
import { CameraRecording } from './entities/camera-recording.entity';
import { CamerasService } from './cameras.service';
import { RecordingsService } from './recordings.service';
import { CamerasController } from './cameras.controller';
import { DeviceAccessModule } from '../device-access/device-access.module';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [TypeOrmModule.forFeature([Device, CameraRecording]), DeviceAccessModule, SecurityModule],
  controllers: [CamerasController],
  providers: [CamerasService, RecordingsService],
  exports: [CamerasService],
})
export class CamerasModule {}
