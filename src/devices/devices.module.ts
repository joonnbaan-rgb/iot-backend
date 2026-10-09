import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from './entities/device.entity';
import { DevicesService } from './devices.service';
import { DevicesController } from './devices.controller';
import { DeviceAccessModule } from '../device-access/device-access.module';
import { CamerasModule } from '../cameras/cameras.module';

@Module({
  imports: [TypeOrmModule.forFeature([Device]), DeviceAccessModule, CamerasModule],
  controllers: [DevicesController],
  providers: [DevicesService],
  exports: [DevicesService],
})
export class DevicesModule {}
