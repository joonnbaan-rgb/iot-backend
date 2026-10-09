import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Device } from '../devices/entities/device.entity';
import { DeviceAccessService } from './device-access.service';

// แยกเป็นโมดูลเล็กๆ ของตัวเอง เพื่อให้ทุกโมดูล (commands, cameras, rules, realtime ฯลฯ)
// เรียกใช้ตรวจสิทธิ์ได้โดยไม่เกิด circular dependency กับ DevicesModule
@Module({
  imports: [TypeOrmModule.forFeature([Device, User])],
  providers: [DeviceAccessService],
  exports: [DeviceAccessService],
})
export class DeviceAccessModule {}
