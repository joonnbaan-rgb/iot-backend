import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from '../devices/entities/device.entity';
import { CameraRecording } from './entities/camera-recording.entity';
import { CamerasService } from './cameras.service';
import { RecordingsService } from './recordings.service';
import { CamerasController } from './cameras.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Device, CameraRecording])],
  controllers: [CamerasController],
  providers: [CamerasService, RecordingsService],
  exports: [CamerasService],
})
export class CamerasModule {}
