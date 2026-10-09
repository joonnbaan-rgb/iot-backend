import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from '../devices/entities/device.entity';
import { User } from '../users/entities/user.entity';
import { DeviceAccessModule } from '../device-access/device-access.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { DeviceGroup } from './entities/device-group.entity';
import { DeviceGroupMember } from './entities/device-group-member.entity';
import { DeviceShare } from './entities/device-share.entity';
import { GroupsService } from './groups.service';
import { SharesService } from './shares.service';
import { SharingController } from './sharing.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeviceGroup, DeviceGroupMember, DeviceShare, Device, User]),
    DeviceAccessModule,
    RealtimeModule,
  ],
  controllers: [SharingController],
  providers: [GroupsService, SharesService],
})
export class SharingModule {}
