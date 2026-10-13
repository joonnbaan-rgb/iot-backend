import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceProfile } from './entities/device-profile.entity';
import { DeviceCatalogService } from './device-catalog.service';
import { DeviceCatalogController } from './device-catalog.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DeviceProfile])],
  controllers: [DeviceCatalogController],
  providers: [DeviceCatalogService],
  exports: [DeviceCatalogService],
})
export class DeviceCatalogModule {}
