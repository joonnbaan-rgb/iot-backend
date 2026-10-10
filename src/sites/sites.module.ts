import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { DeviceAccessModule } from '../device-access/device-access.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { Site } from './entities/site.entity';
import { SiteMember } from './entities/site-member.entity';
import { SitesService } from './sites.service';
import { SitesController } from './sites.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Site, SiteMember, User]), DeviceAccessModule, RealtimeModule],
  controllers: [SitesController],
  providers: [SitesService],
})
export class SitesModule {}
