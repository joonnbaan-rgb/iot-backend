import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SensorData } from './entities/sensor-data.entity';

export interface FindTelemetryOptions {
  limit?: number;
  from?: Date;
  to?: Date;
}

@Injectable()
export class SensorDataService {
  constructor(
    @InjectRepository(SensorData)
    private readonly sensorDataRepository: Repository<SensorData>,
  ) {}

  async findByDevice(deviceId: string, options: FindTelemetryOptions = {}): Promise<SensorData[]> {
    const { limit = 100, from, to } = options;

    const qb = this.sensorDataRepository
      .createQueryBuilder('sd')
      .where('sd.device_id = :deviceId', { deviceId })
      .orderBy('sd.recorded_at', 'DESC')
      .take(Math.min(limit, 1000)); // กันไม่ให้ query ทีเดียวเยอะเกินไป

    if (from) {
      qb.andWhere('sd.recorded_at >= :from', { from });
    }
    if (to) {
      qb.andWhere('sd.recorded_at <= :to', { to });
    }

    return qb.getMany();
  }
}
