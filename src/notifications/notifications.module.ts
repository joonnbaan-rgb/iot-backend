import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { DeviceAccessModule } from '../device-access/device-access.module';
import { NotificationLog } from './entities/notification-log.entity';
import { NotificationChannel } from './entities/notification-channel.entity';
import { NotificationSettings } from './entities/notification-settings.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { LineWebhookController } from './line-webhook.controller';
import { ChannelLinkService } from './channel-link.service';
import { TelegramService } from './telegram.service';
import { LineService } from './line.service';
import { EmailService } from './email.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationLog, NotificationChannel, NotificationSettings, User]),
    DeviceAccessModule,
  ],
  controllers: [NotificationsController, LineWebhookController],
  providers: [NotificationsService, ChannelLinkService, TelegramService, LineService, EmailService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
