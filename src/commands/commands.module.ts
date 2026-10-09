import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceCommand } from '../device-commands/entities/device-command.entity';
import { Device } from '../devices/entities/device.entity';
import { CommandsService } from './commands.service';
import { CommandsController } from './commands.controller';
import { MqttModule } from '../mqtt/mqtt.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DeviceAccessModule } from '../device-access/device-access.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeviceCommand, Device]),
    forwardRef(() => MqttModule),
    RealtimeModule,
    NotificationsModule,
    DeviceAccessModule,
  ],
  controllers: [CommandsController],
  providers: [CommandsService],
  exports: [CommandsService],
})
export class CommandsModule {}
