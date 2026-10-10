import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Redis } from 'ioredis';
import * as os from 'os';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { TelemetryPayloadDto } from './dto/telemetry-payload.dto';
import { RulesService } from '../rules/rules.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { MetricsService } from '../metrics/metrics.service';
import { DeviceStatus } from '../devices/entities/device.entity';
import { IngestQueueService } from './ingest-queue.service';
import { INGEST_DEAD_STREAM, INGEST_GROUP, INGEST_STREAM } from './ingest.constants';

type RawEntry = [string, string[]]; // [id, [field, value, field, value, ...]]

interface Row {
  entryId: string;
  deviceId: string;
  value: number;
  unit: string | null;
  recordedAt: Date;
  receivedAt: number;
  rawPayload: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * ฝั่ง "ผู้บริโภค": อ่าน telemetry จาก Redis Stream เป็น batch แล้ว
 *   1) อัปเดตสถานะอุปกรณ์ (1 query)  2) INSERT sensor_data ทีเดียวทั้ง batch (1 query)
 *   3) ส่ง realtime  4) ตรวจ rule (ค่าล่าสุดต่ออุปกรณ์)  5) ACK
 *
 * รับประกันแบบ at-least-once: ถ้า DB ล่ม message จะไม่ถูก ACK และถูกอ่านซ้ำ (retry พร้อม backoff)
 * message ที่ข้อมูลผิดจริง (data error) จะถูกย้ายไป dead-letter stream แทนที่จะวนซ้ำตลอด
 * ถ้า worker ตายกลางทาง message ที่ค้างอยู่จะถูก consumer ตัวอื่น/ตัวใหม่ XAUTOCLAIM ไปทำต่อ
 */
@Injectable()
export class IngestWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestWorkerService.name);
  private reader: Redis | null = null; // ใช้ BLOCK จึงต้องแยกการเชื่อมต่อ
  private admin: Redis | null = null;
  private running = false;
  private statsTimer: NodeJS.Timeout | null = null;
  private readonly consumer = `${os.hostname()}-${process.pid}`;
  private readonly batchSize: number;
  private loopDone: Promise<void> = Promise.resolve();

  constructor(
    private readonly config: ConfigService,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly queue: IngestQueueService,
    private readonly rules: RulesService,
    private readonly realtime: RealtimeGateway,
    private readonly metrics: MetricsService,
  ) {
    this.batchSize = Math.max(1, parseInt(this.config.get<string>('INGEST_BATCH_SIZE', '500'), 10));
  }

  onModuleInit() {
    if (!this.queue.isEnabled()) return;
    if (this.config.get<string>('INGEST_WORKER', 'true') === 'false') {
      this.logger.log('INGEST_WORKER=false: instance นี้ส่งเข้าคิวอย่างเดียว ไม่ประมวลผล');
      return;
    }
    const opts = {
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: parseInt(this.config.get<string>('REDIS_PORT', '6379'), 10),
    };
    this.reader = new Redis({ ...opts, maxRetriesPerRequest: null });
    this.admin = new Redis({ ...opts, maxRetriesPerRequest: null });
    this.reader.on('error', (e: Error) => this.logger.warn(`Redis (reader): ${e.message}`));
    this.admin.on('error', (e: Error) => this.logger.warn(`Redis (admin): ${e.message}`));
    this.running = true;
    this.loopDone = this.loop();
    this.statsTimer = setInterval(() => void this.collectStats(), 5000);
    this.logger.log(`ingest worker เริ่มทำงาน consumer=${this.consumer} batch=${this.batchSize}`);
  }

  async onModuleDestroy() {
    this.running = false;
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.reader?.disconnect(); // ปลด BLOCK ที่ค้างอยู่
    await Promise.race([this.loopDone, sleep(3000)]);
    this.admin?.disconnect();
  }

  // ---------------------------------------------------------------- loop

  private async ensureGroup(): Promise<void> {
    for (;;) {
      if (!this.running) return;
      try {
        await this.admin!.xgroup('CREATE', INGEST_STREAM, INGEST_GROUP, '0', 'MKSTREAM');
        return;
      } catch (err) {
        if (String((err as Error).message).includes('BUSYGROUP')) return;
        this.logger.warn(`สร้าง consumer group ไม่สำเร็จ ลองใหม่: ${(err as Error).message}`);
        await sleep(2000);
      }
    }
  }

  private async loop(): Promise<void> {
    await this.ensureGroup();
    let readPending = true; // เริ่มต้นให้เคลียร์ของค้างของ consumer ตัวเองก่อน
    let lastClaim = 0;
    let backoff = 0;

    while (this.running) {
      try {
        let entries: RawEntry[] = [];

        if (Date.now() - lastClaim > 30000) {
          entries = await this.claimStale();
          if (entries.length === 0) lastClaim = Date.now();
        }

        if (entries.length === 0) {
          const res = (await this.reader!.xreadgroup(
            'GROUP',
            INGEST_GROUP,
            this.consumer,
            'COUNT',
            this.batchSize,
            'BLOCK',
            1000,
            'STREAMS',
            INGEST_STREAM,
            readPending ? '0' : '>',
          )) as [string, RawEntry[]][] | null;
          entries = res?.[0]?.[1] ?? [];
          if (readPending && entries.length === 0) readPending = false;
        }

        if (entries.length === 0) continue;
        await this.processBatch(entries);
        backoff = 0;
      } catch (err) {
        if (!this.running) break;
        const msg = (err as Error).message ?? String(err);
        this.logger.error(`ประมวลผล batch ล้มเหลว จะลองใหม่: ${msg}`);
        if (msg.includes('NOGROUP')) await this.ensureGroup();
        readPending = true; // อ่านของที่ค้างอยู่ใน PEL ของตัวเองซ้ำ
        backoff = Math.min(backoff ? backoff * 2 : 500, 5000);
        await sleep(backoff);
      }
    }
  }

  private async claimStale(): Promise<RawEntry[]> {
    try {
      const res = (await this.admin!.xautoclaim(
        INGEST_STREAM,
        INGEST_GROUP,
        this.consumer,
        60000,
        '0-0',
        'COUNT',
        100,
      )) as unknown as [string, RawEntry[]];
      return res?.[1] ?? [];
    } catch {
      return [];
    }
  }

  // ---------------------------------------------------------------- batch

  private parse(entries: RawEntry[]): { rows: Row[]; invalid: { id: string; fields: string[] }[] } {
    const rows: Row[] = [];
    const invalid: { id: string; fields: string[] }[] = [];
    for (const [entryId, fields] of entries) {
      // entry ที่ถูก trim ออกจาก stream แล้วแต่ยังค้างใน PEL จะมา fields = null → ทิ้ง (ACK) ไม่ให้ค้างตลอดไป
      if (!Array.isArray(fields)) {
        invalid.push({ id: entryId, fields: [] });
        continue;
      }
      const f: Record<string, string> = {};
      for (let i = 0; i + 1 < fields.length; i += 2) f[fields[i]] = fields[i + 1];
      try {
        const deviceId = f.d;
        if (!deviceId || !UUID_RE.test(deviceId)) throw new Error('bad device id');
        const dto = plainToInstance(TelemetryPayloadDto, JSON.parse(f.p));
        if (validateSync(dto).length > 0) throw new Error('bad payload');
        const receivedAt = Number(f.t) || Date.now();
        const recordedAt = dto.recorded_at ? new Date(dto.recorded_at) : new Date(receivedAt);
        // IsISO8601 ยอมรับบางรูปแบบ (เช่น 2024-W05-1) ที่ JS แปลงเป็นวันที่ไม่ได้ → ถือว่า payload ผิด
        if (isNaN(recordedAt.getTime())) throw new Error('bad recorded_at');
        rows.push({
          entryId,
          deviceId,
          value: dto.value,
          unit: dto.unit ?? null,
          recordedAt,
          receivedAt,
          rawPayload: f.p,
        });
      } catch {
        invalid.push({ id: entryId, fields });
      }
    }
    return { rows, invalid };
  }

  private async processBatch(entries: RawEntry[]): Promise<void> {
    const t0 = process.hrtime.bigint();
    this.metrics.ingestBatchSize.observe(entries.length);

    const { rows, invalid } = this.parse(entries);
    if (invalid.length) {
      this.metrics.ingestProcessedTotal.labels('invalid').inc(invalid.length);
      this.logger.warn(`พบ ${invalid.length} message ที่ payload ไม่ถูกต้อง → ย้ายเข้า dead-letter`);
      await Promise.all(
        invalid.filter((x) => x.fields.length).map((x) => this.deadLetterRaw(x.fields, 'invalid payload')),
      );
    }
    const ack = (ids: string[]) => (ids.length ? this.admin!.xack(INGEST_STREAM, INGEST_GROUP, ...ids) : Promise.resolve(0));
    await ack(invalid.map((x) => x.id));

    let persisted: Row[] = [];
    if (rows.length) {
      try {
        const res = await this.persist(rows);
        persisted = res.rows;
        await ack(rows.map((r) => r.entryId));
        this.announce(res.devices);
      } catch (err) {
        if (!this.isDataError(err)) throw err; // DB ล่ม/ชั่วคราว → ไม่ ACK แล้ว retry (INSERT เป็น idempotent ต่อ entry id)
        // ข้อมูลผิดอย่างน้อย 1 แถว → แยกทำทีละแถวเพื่อหาตัวที่ผิด; ACK ทีละแถวทันทีที่เสร็จ จะได้ไม่ทำซ้ำถ้ารอบหลังล้ม
        for (const row of rows) {
          try {
            const res = await this.persist([row]);
            persisted.push(...res.rows);
            await ack([row.entryId]);
            this.announce(res.devices);
          } catch (e) {
            if (!this.isDataError(e)) throw e;
            await this.deadLetter(row, e as Error);
            await ack([row.entryId]);
          }
        }
      }
    }

    // ขั้นตอนหลังบันทึกสำเร็จ: ห้ามทำให้ batch ล้มเหลว (ไม่งั้นจะ retry)
    const ta = process.hrtime.bigint();
    await this.afterPersist(persisted);
    const afterSec = Number(process.hrtime.bigint() - ta) / 1e9;
    this.metrics.ingestPhaseDuration.labels('after').observe(afterSec);

    const totalSec = Number(process.hrtime.bigint() - t0) / 1e9;
    this.metrics.ingestBatchDuration.observe(totalSec);
    if (totalSec > 2) {
      this.logger.warn(
        `batch ช้า: ${totalSec.toFixed(2)}s สำหรับ ${entries.length} message (ขั้นหลังบันทึก realtime+rules ใช้ ${afterSec.toFixed(2)}s)`,
      );
    }
  }

  /**
   * บันทึกทั้ง batch ใน transaction เดียว (2 query): อัปเดตสถานะอุปกรณ์ + INSERT sensor_data
   * - id ของแถวสร้างจาก stream entry id (md5 -> uuid) + ON CONFLICT DO NOTHING จึงอ่านซ้ำ/retry ได้โดยไม่เกิดแถวซ้ำ
   * - อยู่ใน transaction เดียวกัน: ถ้า INSERT ล้ม สถานะอุปกรณ์ก็ย้อนกลับ ทำให้เหตุการณ์ "กลับมา online" ไม่หาย
   * @returns แถวของอุปกรณ์ที่รู้จัก และรายการอุปกรณ์ (พร้อมสถานะก่อนหน้า) ไว้ประกาศหลัง commit
   */
  private async persist(rows: Row[]): Promise<{ rows: Row[]; devices: { id: string; name: string; prev_status: string }[] }> {
    const tp = process.hrtime.bigint();
    try {
      return await this.persistInner(rows);
    } finally {
      this.metrics.ingestPhaseDuration.labels('db').observe(Number(process.hrtime.bigint() - tp) / 1e9);
    }
  }

  private async persistInner(rows: Row[]): Promise<{ rows: Row[]; devices: { id: string; name: string; prev_status: string }[] }> {
    const ids = [...new Set(rows.map((r) => r.deviceId))];
    const now = new Date();

    return this.ds.transaction(async (m) => {
      // เขียน last_seen_at ไม่ถี่เกิน 5 วินาที/อุปกรณ์ และคืนรายการอุปกรณ์ที่มีอยู่จริง
      const devices: { id: string; name: string; prev_status: string }[] = await m.query(
        `WITH prev AS (
           SELECT id, name, status, last_seen_at FROM devices WHERE id = ANY($1::uuid[])
         ), upd AS (
           UPDATE devices d SET status = 'online', last_seen_at = $2::timestamptz
           FROM prev
           WHERE d.id = prev.id
             AND (prev.status <> 'online' OR prev.last_seen_at IS NULL
                  OR prev.last_seen_at < $2::timestamptz - interval '5 seconds')
           RETURNING d.id
         )
         SELECT id, name, status AS prev_status FROM prev`,
        [ids, now],
      );
      const known = new Set(devices.map((d) => d.id));
      const good = rows.filter((r) => known.has(r.deviceId));
      const unknown = rows.length - good.length;
      if (unknown) this.metrics.ingestProcessedTotal.labels('unknown_device').inc(unknown);

      if (good.length) {
        await m.query(
          `INSERT INTO sensor_data (id, device_id, value, unit, recorded_at)
           SELECT md5(x.e)::uuid, x.d, x.v, x.u, x.t
           FROM unnest($1::text[], $2::uuid[], $3::float8[], $4::text[], $5::timestamptz[]) AS x(e, d, v, u, t)
           ON CONFLICT DO NOTHING`,
          [
            good.map((r) => r.entryId),
            good.map((r) => r.deviceId),
            good.map((r) => r.value),
            good.map((r) => r.unit),
            good.map((r) => r.recordedAt.toISOString()),
          ],
        );
        this.metrics.ingestProcessedTotal.labels('ok').inc(good.length);
        const nowMs = Date.now();
        for (const r of good) this.metrics.ingestEndToEndLag.observe((nowMs - r.receivedAt) / 1000);
      }
      return { rows: good, devices };
    });
  }

  /** ประกาศอุปกรณ์ที่เพิ่งกลับมา online (เรียกหลัง commit เท่านั้น) */
  private announce(devices: { id: string; name: string; prev_status: string }[]): void {
    for (const d of devices) {
      if (d.prev_status !== DeviceStatus.ONLINE) {
        this.logger.log(`device ${d.id} กลับมา online`);
        this.realtime.emitDeviceStatus(d.id, d.name, DeviceStatus.ONLINE);
      }
    }
  }

  private async afterPersist(rows: Row[]): Promise<void> {
    if (!rows.length) return;
    try {
      const latest = new Map<string, Row>();
      for (const r of rows) {
        this.realtime.emitTelemetry(r.deviceId, r.value, r.unit ?? undefined, r.recordedAt);
        const cur = latest.get(r.deviceId);
        if (!cur || r.recordedAt >= cur.recordedAt) latest.set(r.deviceId, r);
      }
      // ตรวจ rule ด้วยค่าล่าสุดของแต่ละอุปกรณ์ใน batch (ทีละกลุ่มเพื่อไม่ถล่ม DB)
      const list = [...latest.values()];
      for (let i = 0; i < list.length; i += 20) {
        const results = await Promise.allSettled(
          list.slice(i, i + 20).map((r) => this.rules.evaluateForSensor(r.deviceId, r.value)),
        );
        for (const res of results) {
          if (res.status === 'rejected') this.logger.error(`ตรวจ rule ล้มเหลว: ${String(res.reason)}`);
        }
      }
    } catch (err) {
      this.logger.error(`ขั้นตอนหลังบันทึกล้มเหลว (ข้ามได้): ${(err as Error).message}`);
    }
  }

  // ---------------------------------------------------------------- helpers

  /** Postgres error class 22 (data exception) / 23 (integrity violation) = ข้อมูลผิด ไม่ใช่ DB มีปัญหา */
  private isDataError(err: unknown): boolean {
    const e = err as { code?: string; driverError?: { code?: string } };
    const code = String(e?.driverError?.code ?? e?.code ?? '');
    return code.startsWith('22') || code.startsWith('23');
  }

  private async deadLetter(row: Row, err: Error): Promise<void> {
    this.metrics.ingestProcessedTotal.labels('dead').inc();
    this.logger.error(`ย้าย message ของ ${row.deviceId} ไป dead-letter: ${err.message}`);
    await this.admin!.xadd(
      INGEST_DEAD_STREAM,
      'MAXLEN',
      '~',
      1000,
      '*',
      'd',
      row.deviceId,
      'p',
      row.rawPayload,
      'err',
      err.message.slice(0, 200),
    );
  }

  private async deadLetterRaw(fields: string[], reason: string): Promise<void> {
    try {
      await this.admin!.xadd(INGEST_DEAD_STREAM, 'MAXLEN', '~', 1000, '*', ...fields, 'err', reason);
    } catch {
      /* dead-letter เป็น best-effort */
    }
  }

  private async collectStats(): Promise<void> {
    try {
      this.metrics.ingestStreamLength.set(await this.admin!.xlen(INGEST_STREAM));
      const pending = (await this.admin!.xpending(INGEST_STREAM, INGEST_GROUP)) as unknown as [number];
      this.metrics.ingestPending.set(Number(pending?.[0] ?? 0));
    } catch {
      /* ไม่เป็นไร รอบหน้าลองใหม่ */
    }
  }
}
