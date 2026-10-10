import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from './entities/device.entity';
import { DevicesService } from './devices.service';
import { DevicesController } from './devices.controller';
import { DeviceAccessModule } from '../device-access/device-access.module';
import { CamerasModule } from '../cameras/cameras.module';
import { SecurityModule } from '../security/security.module';

@Module({
  imports: [TypeOrmModule.forFeature([Device]), DeviceAccessModule, CamerasModule, SecurityModule],
  controllers: [DevicesController],
  providers: [DevicesService],
  exports: [DevicesService],
})
export class DevicesModule {}
