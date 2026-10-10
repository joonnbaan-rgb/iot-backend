import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SensorData } from '../sensor-data/entities/sensor-data.entity';
import { Device, DeviceStatus } from '../devices/entities/device.entity';
import { TelemetryPayloadDto } from './dto/telemetry-payload.dto';
import { RulesService } from '../rules/rules.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    @InjectRepository(SensorData)
    private readonly sensorDataRepository: Repository<SensorData>,
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    private readonly configService: ConfigService,
    private readonly rulesService: RulesService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly notificationsService: NotificationsService,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * เรียกทุกครั้งที่ MqttService ได้รับ message จาก topic devices/{deviceId}/telemetry
   * รับผิดชอบ: validate payload -> เช็คว่า device มีจริง -> บันทึกข้อมูล -> mark online
   */
  async handleTelemetry(deviceId: string, rawPayload: unknown): Promise<void> {
    // 1) validate payload ก่อนเสมอ ป้องกันข้อมูลผิดรูปแบบเข้าไปปนใน DB
    const dto = plainToInstance(TelemetryPayloadDto, rawPayload);
    const errors = await validate(dto);
    if (errors.length > 0) {
      this.logger.warn(
        `payload จาก device ${deviceId} ไม่ผ่าน validation: ${JSON.stringify(errors.map((e) => e.constraints))}`,
      );
      return;
    }

    // 2) ต้องเป็นอุปกรณ์ที่ลงทะเบียนไว้แล้วเท่านั้น (ผ่าน POST /devices ใน phase 1)
    const device = await this.deviceRepository.findOne({ where: { id: deviceId } });
    if (!device) {
      this.logger.warn(`ได้รับ telemetry จาก device ที่ไม่รู้จัก id: ${deviceId} (ยังไม่ได้ลงทะเบียน)`);
      return;
    }

    const recordedAt = dto.recorded_at ? new Date(dto.recorded_at) : new Date();

    // 3) บันทึกข้อมูลลง sensor_data (hypertable)
    const entry = this.sensorDataRepository.create({
      device_id: deviceId,
      value: dto.value,
      unit: dto.unit,
      recorded_at: recordedAt,
    });
    await this.sensorDataRepository.save(entry);

    // 4) mark ว่าอุปกรณ์ออนไลน์ และจำเวลาล่าสุดที่เห็นไว้ (ใช้เช็ค offline ทีหลัง)
    const justCameOnline = device.status !== DeviceStatus.ONLINE;
    device.status = DeviceStatus.ONLINE;
    device.last_seen_at = new Date();
    await this.deviceRepository.save(device);

    if (justCameOnline) {
      this.logger.log(`device ${deviceId} กลับมา online`);
      this.realtimeGateway.emitDeviceStatus(deviceId, device.name, DeviceStatus.ONLINE);
    }

    // ส่ง telemetry ออกทาง WebSocket ทุกครั้ง ให้ dashboard ที่ subscribe device นี้อยู่เห็นค่าล่าสุดแบบ real-time
    this.realtimeGateway.emitTelemetry(deviceId, dto.value, dto.unit, recordedAt);

    // 5) เช็คว่ามี rule ไหนผูกกับเซนเซอร์นี้ที่ต้องทำงานหรือไม่ (phase 4)
    await this.rulesService.evaluateForSensor(deviceId, dto.value);
  }

  /**
   * รันทุก 15 วินาที: อุปกรณ์ไหนที่ status = online แต่ last_seen_at
   * เกิน threshold ที่กำหนด (ค่า default 30 วินาที) ให้ mark เป็น offline
   */
  @Interval(15000)
  async markStaleDevicesOffline(): Promise<void> {
    const thresholdSeconds = parseInt(
      this.configService.get<string>('DEVICE_OFFLINE_THRESHOLD_SECONDS', '30'),
      10,
    );
    const cutoff = new Date(Date.now() - thresholdSeconds * 1000);

    const staleDevices = await this.deviceRepository.find({
      where: {
        status: DeviceStatus.ONLINE,
        last_seen_at: LessThan(cutoff),
      },
    });

    for (const device of staleDevices) {
      device.status = DeviceStatus.OFFLINE;
      await this.deviceRepository.save(device);
      this.logger.warn(`device ${device.id} (${device.name}) ไม่มีข้อมูลเข้ามา > ${thresholdSeconds}s ถูก mark เป็น offline`);

      this.realtimeGateway.emitDeviceStatus(device.id, device.name, DeviceStatus.OFFLINE);
      await this.notificationsService.notify(
        'device_offline',
        `⚠️ อุปกรณ์ "${device.name}" (${device.id}) ออฟไลน์ — ไม่มีข้อมูลเข้ามาเกิน ${thresholdSeconds} วินาที`,
        { deviceId: device.id },
      );
    }

    // ค่าสำหรับ Grafana: จำนวนอุปกรณ์ออนไลน์ ณ ตอนนี้ (อัปเดตทุก 15 วินาทีตามรอบนี้)
    try {
      this.metrics.devicesOnlineGauge.set(
        await this.deviceRepository.count({ where: { status: DeviceStatus.ONLINE } }),
      );
    } catch {
      /* ไม่สำคัญ */
    }
  }
}
