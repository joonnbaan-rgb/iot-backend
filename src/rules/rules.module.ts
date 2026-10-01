import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rule } from './entities/rule.entity';
import { RuleExecutionLog } from './entities/rule-execution-log.entity';
import { Device } from '../devices/entities/device.entity';
import { RulesService } from './rules.service';
import { RulesController } from './rules.controller';
import { CommandsModule } from '../commands/commands.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Rule, RuleExecutionLog, Device]),
    CommandsModule,
    RealtimeModule,
    NotificationsModule,
  ],
  controllers: [RulesController],
  providers: [RulesService],
  exports: [RulesService],
})
export class RulesModule {}
