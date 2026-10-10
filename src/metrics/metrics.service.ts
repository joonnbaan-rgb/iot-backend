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

  // เฟส H: ท่อรับ telemetry (Redis Streams)
  public ingestEnqueuedTotal: client.Counter<string>;
  public ingestProcessedTotal: client.Counter<string>;
  public ingestBatchSize: client.Histogram<string>;
  public ingestBatchDuration: client.Histogram<string>;
  public ingestEndToEndLag: client.Histogram<string>;
  public ingestStreamLength: client.Gauge<string>;
  public ingestPending: client.Gauge<string>;

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

    this.ingestEnqueuedTotal = new client.Counter({
      name: 'iot_ingest_enqueued_total',
      help: 'telemetry ที่ MQTT ส่งเข้าคิว (result=queued|fallback_direct)',
      labelNames: ['result'],
      registers: [this.registry],
    });

    this.ingestProcessedTotal = new client.Counter({
      name: 'iot_ingest_processed_total',
      help: 'telemetry ที่ worker ประมวลผลแล้ว (result=ok|invalid|unknown_device|dead)',
      labelNames: ['result'],
      registers: [this.registry],
    });

    this.ingestBatchSize = new client.Histogram({
      name: 'iot_ingest_batch_size',
      help: 'จำนวน message ต่อ batch ที่ worker อ่านจากคิว',
      buckets: [1, 5, 10, 50, 100, 250, 500, 1000],
      registers: [this.registry],
    });

    this.ingestBatchDuration = new client.Histogram({
      name: 'iot_ingest_batch_duration_seconds',
      help: 'เวลาที่ใช้ประมวลผล 1 batch (ลง DB + rules + realtime)',
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });

    this.ingestEndToEndLag = new client.Histogram({
      name: 'iot_ingest_end_to_end_lag_seconds',
      help: 'เวลาตั้งแต่ backend รับ message จาก MQTT จนบันทึกลง DB',
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 15, 60],
      registers: [this.registry],
    });

    this.ingestStreamLength = new client.Gauge({
      name: 'iot_ingest_stream_length',
      help: 'จำนวน message ที่ค้างอยู่ใน Redis Stream (รวมที่ประมวลผลแล้วแต่ยังไม่ถูก trim)',
      registers: [this.registry],
    });

    this.ingestPending = new client.Gauge({
      name: 'iot_ingest_pending',
      help: 'จำนวน message ที่ถูกอ่านแล้วแต่ยังไม่ได้ ACK',
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
