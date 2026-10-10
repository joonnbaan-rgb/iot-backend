import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rule, RuleOperator } from './entities/rule.entity';
import { RuleExecutionLog } from './entities/rule-execution-log.entity';
import { Device } from '../devices/entities/device.entity';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';
import { CommandsService } from '../commands/commands.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { DeviceAccessService } from '../device-access/device-access.service';
import { UserRole } from '../users/entities/user.entity';

@Injectable()
export class RulesService {
  private readonly logger = new Logger(RulesService.name);

  constructor(
    @InjectRepository(Rule)
    private readonly ruleRepository: Repository<Rule>,
    @InjectRepository(RuleExecutionLog)
    private readonly logRepository: Repository<RuleExecutionLog>,
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    private readonly commandsService: CommandsService,
    private readonly realtimeGateway: RealtimeGateway,
    private readonly notificationsService: NotificationsService,
    private readonly access: DeviceAccessService,
  ) {}

  /** rule ต้องผูกกับอุปกรณ์ที่ผู้สร้างมองเห็น (เซนเซอร์) และสั่งงานได้ (เป้าหมาย) */
  async create(user: CurrentUserPayload, dto: CreateRuleDto): Promise<Rule> {
    await this.access.assert(user, dto.sensor_device_id, 'view');
    await this.access.assert(user, dto.target_device_id, 'control');
    const rule = this.ruleRepository.create({ ...dto, owner_id: user.sub });
    return this.ruleRepository.save(rule);
  }

  /** admin เห็นทุก rule, ผู้ใช้ทั่วไปเห็นเฉพาะที่ตัวเองสร้าง */
  findAllFor(user: CurrentUserPayload): Promise<Rule[]> {
    return this.ruleRepository.find({
      where: user.role === UserRole.ADMIN ? {} : { owner_id: user.sub },
      order: { created_at: 'DESC' },
    });
  }

  async findOneFor(user: CurrentUserPayload, id: string): Promise<Rule> {
    const rule = await this.ruleRepository.findOne({ where: { id } });
    // ไม่ใช่ของตัวเองและไม่ใช่ admin -> 404 เหมือนไม่มี rule นี้ (ไม่เปิดเผยการมีอยู่)
    if (!rule || (user.role !== UserRole.ADMIN && rule.owner_id !== user.sub)) {
      throw new NotFoundException(`ไม่พบ rule id: ${id}`);
    }
    return rule;
  }

  async updateFor(user: CurrentUserPayload, id: string, dto: UpdateRuleDto): Promise<Rule> {
    const rule = await this.findOneFor(user, id);
    if (dto.sensor_device_id) await this.access.assert(user, dto.sensor_device_id, 'view');
    if (dto.target_device_id) await this.access.assert(user, dto.target_device_id, 'control');
    Object.assign(rule, dto);
    return this.ruleRepository.save(rule);
  }

  async removeFor(user: CurrentUserPayload, id: string): Promise<void> {
    const rule = await this.findOneFor(user, id);
    await this.ruleRepository.remove(rule);
  }

  async findLogsFor(user: CurrentUserPayload, ruleId: string, limit = 50): Promise<RuleExecutionLog[]> {
    await this.findOneFor(user, ruleId);
    return this.logRepository.find({
      where: { rule_id: ruleId },
      order: { created_at: 'DESC' },
      take: Math.min(limit, 200),
    });
  }

  private matches(value: number, operator: RuleOperator, threshold: number): boolean {
    switch (operator) {
      case RuleOperator.GT:
        return value > threshold;
      case RuleOperator.LT:
        return value < threshold;
      case RuleOperator.GTE:
        return value >= threshold;
      case RuleOperator.LTE:
        return value <= threshold;
      case RuleOperator.EQ:
        return value === threshold;
      case RuleOperator.NEQ:
        return value !== threshold;
      default:
        return false;
    }
  }

  /**
   * เรียกจาก IngestionService ทุกครั้งที่มี telemetry ใหม่เข้ามาจากเซนเซอร์ตัวหนึ่งๆ
   * เช็คทุก rule ที่ผูกกับเซนเซอร์นั้น ถ้าเงื่อนไขตรงและไม่ติด cooldown จะสั่งงานอุปกรณ์เป้าหมายทันที
   */
  async evaluateForSensor(sensorDeviceId: string, value: number): Promise<void> {
    const rules = await this.ruleRepository.find({
      where: { sensor_device_id: sensorDeviceId, enabled: true },
    });

    for (const rule of rules) {
      if (!this.matches(value, rule.operator, rule.threshold)) {
        continue; // เงื่อนไขไม่ตรง ข้ามไปเงียบๆ ไม่ต้อง log กันตารางบวมเกินไป
      }

      const cooldownMs = rule.cooldown_seconds * 1000;
      const stillInCooldown =
        rule.last_triggered_at && Date.now() - rule.last_triggered_at.getTime() < cooldownMs;

      if (stillInCooldown) {
        this.logger.debug(`rule ${rule.id} เงื่อนไขตรงแต่ยังอยู่ใน cooldown ข้ามไปก่อน`);
        await this.logRepository.save(
          this.logRepository.create({
            rule_id: rule.id,
            sensor_value: value,
            triggered: true,
            skipped_reason: 'cooldown',
          }),
        );
        continue;
      }

      try {
        const command = await this.commandsService.sendCommand(rule.target_device_id, rule.action);
        rule.last_triggered_at = new Date();
        await this.ruleRepository.save(rule);
        await this.logRepository.save(
          this.logRepository.create({
            rule_id: rule.id,
            sensor_value: value,
            triggered: true,
            command_id: command.id,
          }),
        );
        this.logger.log(
          `rule ${rule.id} (${rule.name ?? 'ไม่มีชื่อ'}) ทำงาน: ค่า ${value} ${rule.operator} ${rule.threshold} -> สั่ง "${rule.action}" ไปที่ device ${rule.target_device_id}`,
        );

        this.realtimeGateway.emitRuleTriggered(rule.id, rule.name ?? null, rule.target_device_id, rule.action);
        await this.notificationsService.notify(
          'rule_triggered',
          `🔔 Rule "${rule.name ?? rule.id}" ทำงาน: ค่า ${value} ${rule.operator} ${rule.threshold} → สั่ง "${rule.action}"`,
          { deviceId: rule.target_device_id, userIds: rule.owner_id ? [rule.owner_id] : [] },
        );
      } catch (err) {
        this.logger.error(`rule ${rule.id} สั่งงานล้มเหลว: ${err.message}`);
        await this.logRepository.save(
          this.logRepository.create({
            rule_id: rule.id,
            sensor_value: value,
            triggered: true,
            skipped_reason: `error: ${err.message}`,
          }),
        );
      }
    }
  }
}
