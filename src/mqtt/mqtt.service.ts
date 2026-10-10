import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mqtt from 'mqtt';
import { IngestionService } from '../ingestion/ingestion.service';
import { CommandsService } from '../commands/commands.service';

const TELEMETRY_TOPIC_FILTER = 'devices/+/telemetry';
const ACK_TOPIC_FILTER = 'devices/+/ack';

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client: mqtt.MqttClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly ingestionService: IngestionService,
    @Inject(forwardRef(() => CommandsService))
    private readonly commandsService: CommandsService,
  ) {}

  onModuleInit() {
    const url = this.configService.get<string>('MQTT_URL', 'mqtt://localhost:1883');
    this.client = mqtt.connect(url, {
      reconnectPeriod: 2000,
      username: this.configService.get<string>('MQTT_USERNAME') || undefined,
      password: this.configService.get<string>('MQTT_PASSWORD') || undefined,
      clientId: `iot-backend-${Math.random().toString(16).slice(2)}`,
    });

    this.client.on('connect', () => {
      this.logger.log(`เชื่อมต่อ MQTT broker สำเร็จที่ ${url}`);
      this.client.subscribe([TELEMETRY_TOPIC_FILTER, ACK_TOPIC_FILTER], { qos: 1 }, (err) => {
        if (err) {
          this.logger.error(`subscribe topic ล้มเหลว: ${err.message}`);
        } else {
          this.logger.log(`subscribe "${TELEMETRY_TOPIC_FILTER}" และ "${ACK_TOPIC_FILTER}" สำเร็จ`);
        }
      });
    });

    this.client.on('message', (topic, payloadBuffer) => {
      this.handleIncomingMessage(topic, payloadBuffer).catch((err) => {
        this.logger.error(`ประมวลผล message จาก topic ${topic} ล้มเหลว: ${err.message}`);
      });
    });

    this.client.on('error', (err) => {
      this.logger.error(`MQTT connection error: ${err.message}`);
    });

    this.client.on('reconnect', () => {
      this.logger.warn('กำลังพยายามเชื่อมต่อ MQTT broker ใหม่...');
    });
  }

  private async handleIncomingMessage(topic: string, payloadBuffer: Buffer): Promise<void> {
    // topic รูปแบบ: devices/{deviceId}/{telemetry|ack}
    const parts = topic.split('/');
    if (parts.length !== 3 || parts[0] !== 'devices') {
      this.logger.warn(`ได้รับ message จาก topic รูปแบบไม่ถูกต้อง: ${topic}`);
      return;
    }
    const deviceId = parts[1];
    const messageType = parts[2];

    let parsed: unknown;
    try {
      parsed = JSON.parse(payloadBuffer.toString());
    } catch {
      this.logger.warn(`payload จาก topic ${topic} ไม่ใช่ JSON ที่ถูกต้อง`);
      return;
    }

    if (messageType === 'telemetry') {
      await this.ingestionService.handleTelemetry(deviceId, parsed);
    } else if (messageType === 'ack') {
      await this.commandsService.handleAck(deviceId, parsed);
    } else {
      this.logger.warn(`ไม่รู้จัก message type "${messageType}" จาก topic ${topic}`);
    }
  }

  /**
   * publish ข้อมูลออกไปยังอุปกรณ์ (ใช้โดย CommandsService สำหรับส่งคำสั่งควบคุม)
   */
  publish(topic: string, payload: Record<string, unknown>): void {
    if (!this.client?.connected) {
      this.logger.warn(`พยายาม publish ไปที่ ${topic} แต่ยังไม่ได้เชื่อมต่อ MQTT broker`);
    }
    this.client.publish(topic, JSON.stringify(payload), { qos: 1 });
  }

  isConnected(): boolean {
    return this.client?.connected ?? false;
  }

  onModuleDestroy() {
    this.client?.end();
  }
}
