import { forwardRef, Module } from '@nestjs/common';
import { MqttService } from './mqtt.service';
import { IngestionModule } from '../ingestion/ingestion.module';
import { CommandsModule } from '../commands/commands.module';

@Module({
  imports: [IngestionModule, forwardRef(() => CommandsModule)],
  providers: [MqttService],
  exports: [MqttService],
})
export class MqttModule {}
