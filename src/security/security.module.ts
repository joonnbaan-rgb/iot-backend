import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Device } from '../devices/entities/device.entity';
import { InternalController } from './internal.controller';
import { MqttCredentialsService } from './mqtt-credentials.service';
import { StreamTokenService } from './stream-token.service';

@Module({
  imports: [TypeOrmModule.forFeature([Device])],
  controllers: [InternalController],
  providers: [MqttCredentialsService, StreamTokenService],
  exports: [MqttCredentialsService, StreamTokenService],
})
export class SecurityModule {}
