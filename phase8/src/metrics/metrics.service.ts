import { Injectable, OnModuleInit } from '@nestjs/common';
import * as client from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  private registry: client.Registry;

  // custom metrics — เติมเพิ่มได้ตามต้องการ
  public httpRequestDuration: client.Histogram<string>;
  public mqttMessagesTotal: client.Counter<string>;
  public devicesOnlineGauge: client.Gauge<string>;
  public commandsTotal: client.Counter<string>;
  public rulesTriggeredTotal: client.Counter<string>;

  onModuleInit() {
    this.registry = new client.Registry();

    // default process/runtime metrics (CPU, memory, event loop lag, GC ฯลฯ)
    client.collectDefaultMetrics({ register: this.registry, prefix: 'iot_' });

    this.httpRequestDuration = new client.Histogram({
      name: 'iot_http_request_duration_seconds',
      help: 'ระยะเวลาตอบสนองของ HTTP request',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    this.mqttMessagesTotal = new client.Counter({
      name: 'iot_mqtt_messages_total',
      help: 'จำนวนข้อความ MQTT ที่ได้รับทั้งหมด',
      labelNames: ['topic_type'],
      registers: [this.registry],
    });

    this.devicesOnlineGauge = new client.Gauge({
      name: 'iot_devices_online',
      help: 'จำนวนอุปกรณ์ที่ online อยู่ ณ ขณะนี้',
      registers: [this.registry],
    });

    this.commandsTotal = new client.Counter({
      name: 'iot_commands_total',
      help: 'จำนวนคำสั่งที่ส่งไปยังอุปกรณ์ทั้งหมด',
      labelNames: ['status'],
      registers: [this.registry],
    });

    this.rulesTriggeredTotal = new client.Counter({
      name: 'iot_rules_triggered_total',
      help: 'จำนวนครั้งที่ rule ถูก trigger',
      labelNames: ['rule_id'],
      registers: [this.registry],
    });
  }

  getRegistry(): client.Registry {
    return this.registry;
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
