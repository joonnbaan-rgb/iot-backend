import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { MqttModule } from '../mqtt/mqtt.module';

@Module({
  imports: [MqttModule],
  controllers: [HealthController],
})
export class HealthModule {}
