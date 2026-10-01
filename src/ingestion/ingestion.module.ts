import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SensorData } from '../sensor-data/entities/sensor-data.entity';
import { Device } from '../devices/entities/device.entity';
import { IngestionService } from './ingestion.service';
import { RulesModule } from '../rules/rules.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SensorData, Device]),
    RulesModule,
    RealtimeModule,
    NotificationsModule,
  ],
  providers: [IngestionService],
  exports: [IngestionService],
})
export class IngestionModule {}
