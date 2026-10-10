import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { MetricsService } from '../metrics/metrics.service';
import { INGEST_STREAM } from './ingest.constants';

/**
 * ฝั่ง "ผู้ผลิต": MqttService ส่ง telemetry เข้า Redis Stream แทนการเขียน DB ทันที
 * ทำให้รับ message ได้เร็ว (XADD อย่างเดียว) และให้ worker รวมเป็น batch เขียน DB ทีเดียว
 *
 * INGEST_MODE=direct (ค่าเริ่มต้น) → ไม่ใช้คิว ประมวลผลทันทีเหมือนเดิม
 * INGEST_MODE=stream              → ใช้คิว; ถ้า Redis ใช้ไม่ได้จะ fallback เป็น direct อัตโนมัติ (ไม่ทิ้งข้อมูล)
 */
@Injectable()
export class IngestQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(IngestQueueService.name);
  private redis: Redis | null = null;
  private lastErrorLogAt = 0;
  private readonly maxLen: number;
  readonly mode: 'direct' | 'stream';

  constructor(
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
  ) {
    this.mode = this.config.get<string>('INGEST_MODE', 'direct') === 'stream' ? 'stream' : 'direct';
    this.maxLen = parseInt(this.config.get<string>('INGEST_STREAM_MAXLEN', '200000'), 10);
    if (this.mode === 'stream') {
      this.logger.log(`INGEST_MODE=stream (คิว ${INGEST_STREAM}, trim ~${this.maxLen})`);
    }
  }

  isEnabled(): boolean {
    return this.mode === 'stream';
  }

  private client(): Redis {
    if (!this.redis) {
      this.redis = new Redis({
        host: this.config.get<string>('REDIS_HOST', 'localhost'),
        port: parseInt(this.config.get<string>('REDIS_PORT', '6379'), 10),
        // ถ้า Redis ล่ม ให้ล้มเหลวทันที (แล้ว fallback เป็น direct) ไม่ต้องสะสมคำสั่งไว้ในหน่วยความจำ
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        enableAutoPipelining: true, // รวมหลาย XADD ที่เกิดพร้อมกันเป็น 1 round-trip
      });
      this.redis.on('error', (err: Error) => this.logError(`Redis (producer) error: ${err.message}`));
    }
    return this.redis;
  }

  private logError(msg: string) {
    const now = Date.now();
    if (now - this.lastErrorLogAt > 10000) {
      this.lastErrorLogAt = now;
      this.logger.error(msg);
    }
  }

  /** @returns true = ส่งเข้าคิวแล้ว; false = ไม่ได้ใช้คิว/ส่งไม่สำเร็จ (ผู้เรียกต้องประมวลผลเอง) */
  async enqueue(deviceId: string, payload: unknown): Promise<boolean> {
    if (!this.isEnabled()) return false;
    try {
      await this.client().xadd(
        INGEST_STREAM,
        'MAXLEN',
        '~',
        this.maxLen,
        '*',
        'd',
        deviceId,
        'p',
        JSON.stringify(payload),
        't',
        Date.now(),
      );
      this.metrics.ingestEnqueuedTotal.labels('queued').inc();
      return true;
    } catch (err) {
      this.metrics.ingestEnqueuedTotal.labels('fallback_direct').inc();
      this.logError(`ส่งเข้าคิวไม่สำเร็จ จะประมวลผลตรง: ${(err as Error).message}`);
      return false;
    }
  }

  async onModuleDestroy() {
    this.redis?.disconnect();
  }
}
