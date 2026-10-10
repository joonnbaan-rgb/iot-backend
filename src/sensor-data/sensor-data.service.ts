import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
    @InjectDataSource() private readonly ds: DataSource,
  ) {}

  private caggCache = new Map<string, { ok: boolean; at: number }>();

  /** ตรวจว่ามี continuous aggregate นี้อยู่จริงไหม (แคช 60 วินาที) — ถ้าไม่มีจะคำนวณจากข้อมูลดิบแทน */
  private async hasView(name: 'sensor_data_5m' | 'sensor_data_1h'): Promise<boolean> {
    const c = this.caggCache.get(name);
    if (c && Date.now() - c.at < 60000) return c.ok;
    const rows = await this.ds.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [name]);
    const ok = !!rows[0]?.ok;
    this.caggCache.set(name, { ok, at: Date.now() });
    return ok;
  }

  /**
   * สรุปค่าเป็นช่วงเวลา (avg/min/max) สำหรับวาดกราฟ
   * bucket=auto: เลือกขนาดช่วงตามความยาวของช่วงเวลา (<=2 ชม. 1 นาที, <=2 วัน 5 นาที, นานกว่านั้น 1 ชม.)
   */
  async summary(
    deviceId: string,
    opts: { from?: Date; to?: Date; bucket?: string },
  ): Promise<{
    bucket: string;
    from: string;
    to: string;
    unit: string | null;
    points: { t: string; avg: number; min: number; max: number; n: number }[];
  }> {
    const to = opts.to && !isNaN(opts.to.getTime()) ? opts.to : new Date();
    let from = opts.from && !isNaN(opts.from.getTime()) ? opts.from : new Date(to.getTime() - 24 * 3600 * 1000);
    const maxMs = 400 * 24 * 3600 * 1000;
    if (to.getTime() - from.getTime() > maxMs) from = new Date(to.getTime() - maxMs);
    if (from >= to) from = new Date(to.getTime() - 3600 * 1000);

    const span = to.getTime() - from.getTime();
    let bucket = opts.bucket ?? 'auto';
    if (!['auto', '1m', '5m', '1h'].includes(bucket)) bucket = 'auto';
    if (bucket === 'auto') bucket = span <= 2 * 3600e3 ? '1m' : span <= 2 * 24 * 3600e3 ? '5m' : '1h';

    // กันจำนวนจุดล้นเมื่อผู้เรียกระบุ bucket ละเอียดเกินไปสำหรับช่วงเวลานั้น (เป้า ≤ ~5000 จุด)
    const secs: Record<string, number> = { '1m': 60, '5m': 300, '1h': 3600 };
    const order = ['1m', '5m', '1h'];
    while (span / 1000 / secs[bucket] > 5000 && bucket !== '1h') bucket = order[order.indexOf(bucket) + 1];

    const interval = { '1m': '1 minute', '5m': '5 minutes', '1h': '1 hour' }[bucket as '1m' | '5m' | '1h'];
    const view = bucket === '5m' ? 'sensor_data_5m' : bucket === '1h' ? 'sensor_data_1h' : null;

    let rows: { t: Date; avg: number; min: number; max: number; n: string }[];
    if (view && (await this.hasView(view))) {
      rows = await this.ds.query(
        `SELECT bucket AS t, sum_value / NULLIF(samples, 0) AS avg, min_value AS min, max_value AS max, samples AS n
           FROM ${view}
          WHERE device_id = $1 AND bucket >= time_bucket($4::interval, $2::timestamptz) AND bucket < $3
          ORDER BY bucket`,
        [deviceId, from, to, interval],
      );
    } else {
      rows = await this.ds.query(
        `SELECT time_bucket($4::interval, recorded_at) AS t, avg(value) AS avg, min(value) AS min, max(value) AS max, count(*) AS n
           FROM sensor_data
          WHERE device_id = $1 AND recorded_at >= time_bucket($4::interval, $2::timestamptz) AND recorded_at < $3
          GROUP BY 1 ORDER BY 1`,
        [deviceId, from, to, interval],
      );
    }

    const unitRow = await this.ds.query(
      `SELECT unit FROM sensor_data WHERE device_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
      [deviceId],
    );

    return {
      bucket,
      from: from.toISOString(),
      to: to.toISOString(),
      unit: unitRow[0]?.unit ?? null,
      points: rows
        .filter((r) => r.avg !== null)
        .map((r) => ({
          t: new Date(r.t).toISOString(),
          avg: Number(r.avg),
          min: Number(r.min),
          max: Number(r.max),
          n: Number(r.n),
        })),
    };
  }

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
