import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { DevicesModule } from '../devices/devices.module';
import { DeviceAccessModule } from '../device-access/device-access.module';
import { AdminController } from './admin.controller';
import { UserDeletionService } from './user-deletion.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), DevicesModule, DeviceAccessModule],
  controllers: [AdminController],
  providers: [UserDeletionService],
})
export class AdminModule {}
