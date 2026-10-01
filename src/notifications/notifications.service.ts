import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationLog, NotificationStatus } from './entities/notification-log.entity';
import { TelegramService } from './telegram.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(NotificationLog)
    private readonly logRepository: Repository<NotificationLog>,
    private readonly telegramService: TelegramService,
  ) {}

  /**
   * ส่งแจ้งเตือนออกไปยัง Telegram (ถ้าตั้งค่าไว้) และเก็บ log ไว้เสมอไม่ว่าผลจะเป็นอย่างไร
   * ตั้งใจไม่ throw error ออกไป เพราะการแจ้งเตือนล้มเหลวไม่ควรทำให้ rule engine หรือ ingestion pipeline พังตาม
   */
  async notify(eventType: string, message: string): Promise<void> {
    if (!this.telegramService.isConfigured()) {
      await this.logRepository.save(
        this.logRepository.create({
          channel: 'telegram',
          event_type: eventType,
          message,
          status: NotificationStatus.SKIPPED,
          error: 'ยังไม่ได้ตั้งค่า TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID',
        }),
      );
      return;
    }

    try {
      await this.telegramService.sendMessage(message);
      await this.logRepository.save(
        this.logRepository.create({
          channel: 'telegram',
          event_type: eventType,
          message,
          status: NotificationStatus.SENT,
        }),
      );
    } catch (err) {
      this.logger.error(`ส่งแจ้งเตือนล้มเหลว (${eventType}): ${err.message}`);
      await this.logRepository.save(
        this.logRepository.create({
          channel: 'telegram',
          event_type: eventType,
          message,
          status: NotificationStatus.FAILED,
          error: err.message,
        }),
      );
    }
  }

  findRecent(limit = 50): Promise<NotificationLog[]> {
    return this.logRepository.find({
      order: { created_at: 'DESC' },
      take: Math.min(limit, 200),
    });
  }
}
