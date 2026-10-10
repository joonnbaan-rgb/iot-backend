import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DeviceCommand, CommandStatus } from '../device-commands/entities/device-command.entity';
import { Device } from '../devices/entities/device.entity';
import { AckPayloadDto, AckStatus } from './dto/ack-payload.dto';
import { MqttService } from '../mqtt/mqtt.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class CommandsService {
  private readonly logger = new Logger(CommandsService.name);
  private readonly commandTimeoutMs: number;
  // เก็บ timer ของคำสั่งที่ยัง pending ไว้ในหน่วยความจำ เพื่อยกเลิกเมื่อ ack มาถึงก่อนหมดเวลา
  private readonly pendingTimeouts = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectRepository(DeviceCommand)
    private readonly commandRepository: Repository<DeviceCommand>,
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    @Inject(forwardRef(() => MqttService))
    private readonly mqttService: MqttService,
    private readonly configService: ConfigService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly notificationsService: NotificationsService,
  ) {
    this.commandTimeoutMs = parseInt(
      this.configService.get<string>('COMMAND_TIMEOUT_MS', '10000'),
      10,
    );
  }

  /**
   * สั่งงานอุปกรณ์: สร้าง record สถานะ pending -> publish คำสั่งผ่าน MQTT -> ตั้ง timeout ไว้รอ ack
   */
  async sendCommand(deviceId: string, action: string): Promise<DeviceCommand> {
    const device = await this.deviceRepository.findOne({ where: { id: deviceId } });
    if (!device) {
      throw new NotFoundException(`ไม่พบอุปกรณ์ id: ${deviceId}`);
    }

    const command = this.commandRepository.create({
      device_id: deviceId,
      action,
      status: CommandStatus.PENDING,
    });
    await this.commandRepository.save(command);

    this.mqttService.publish(`devices/${deviceId}/command`, {
      command_id: command.id,
      action,
    });

    const timer = setTimeout(() => {
      this.handleTimeout(command.id).catch((err) =>
        this.logger.error(`จัดการ timeout ของคำสั่ง ${command.id} ล้มเหลว: ${err.message}`),
      );
    }, this.commandTimeoutMs);
    this.pendingTimeouts.set(command.id, timer);

    this.logger.log(`ส่งคำสั่ง "${action}" ไปยัง device ${deviceId} (command_id: ${command.id})`);
    return command;
  }

  /**
   * เรียกจาก MqttService เมื่อได้รับ message จาก topic devices/{deviceId}/ack
   */
  async handleAck(deviceId: string, rawPayload: unknown): Promise<void> {
    const dto = plainToInstance(AckPayloadDto, rawPayload);
    const errors = await validate(dto);
    if (errors.length > 0) {
      this.logger.warn(
        `ack payload จาก device ${deviceId} ไม่ผ่าน validation: ${JSON.stringify(errors.map((e) => e.constraints))}`,
      );
      return;
    }

    const command = await this.commandRepository.findOne({
      where: { id: dto.command_id, device_id: deviceId },
    });
    if (!command) {
      this.logger.warn(
        `ได้รับ ack สำหรับ command_id ${dto.command_id} ที่ไม่พบ หรือไม่ตรงกับ device ${deviceId}`,
      );
      return;
    }
    if (command.status !== CommandStatus.PENDING) {
      this.logger.warn(`ได้รับ ack ซ้ำสำหรับคำสั่ง ${command.id} (สถานะปัจจุบัน: ${command.status})`);
      return;
    }

    command.status = dto.status === AckStatus.SUCCESS ? CommandStatus.SUCCESS : CommandStatus.FAILED;
    await this.commandRepository.save(command);

    const timer = this.pendingTimeouts.get(command.id);
    if (timer) {
      clearTimeout(timer);
      this.pendingTimeouts.delete(command.id);
    }

    this.logger.log(`คำสั่ง ${command.id} (${command.action}) => ${command.status}`);
    this.realtimeGateway.emitCommandStatus(deviceId, command.id, command.action, command.status);
  }

  private async handleTimeout(commandId: string): Promise<void> {
    this.pendingTimeouts.delete(commandId);
    const command = await this.commandRepository.findOne({ where: { id: commandId } });
    if (command && command.status === CommandStatus.PENDING) {
      command.status = CommandStatus.TIMEOUT;
      await this.commandRepository.save(command);
      this.logger.warn(`คำสั่ง ${commandId} timeout — ไม่ได้รับ ack ภายใน ${this.commandTimeoutMs}ms`);

      this.realtimeGateway.emitCommandStatus(command.device_id, command.id, command.action, command.status);
      await this.notificationsService.notify(
        'command_timeout',
        `⏱️ คำสั่ง "${command.action}" ไปยังอุปกรณ์ ${command.device_id} หมดเวลา ไม่ได้รับการตอบกลับจากอุปกรณ์`,
        { deviceId: command.device_id },
      );
    }
  }

  findHistory(deviceId: string, limit = 50): Promise<DeviceCommand[]> {
    return this.commandRepository.find({
      where: { device_id: deviceId },
      order: { created_at: 'DESC' },
      take: Math.min(limit, 200),
    });
  }

  findOne(commandId: string): Promise<DeviceCommand | null> {
    return this.commandRepository.findOne({ where: { id: commandId } });
  }
}
