import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { Device } from '../devices/entities/device.entity';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** รหัสเชื่อมต่อ MQTT ราย device: username = device id, password = ค่าสุ่ม 48 hex (เห็นครั้งเดียวตอนออก) */
@Injectable()
export class MqttCredentialsService {
  constructor(@InjectRepository(Device) private readonly devices: Repository<Device>) {}

  /** ออกรหัสใหม่ (ทับของเดิม = รหัสเก่าใช้ไม่ได้ทันทีเมื่อเชื่อมต่อครั้งถัดไป) */
  async issue(deviceId: string): Promise<string> {
    const secret = randomBytes(24).toString('hex');
    await this.devices.query(
      `UPDATE devices SET mqtt_secret_hash = $2, mqtt_credentials_at = now() WHERE id = $1`,
      [deviceId, sha256(secret)],
    );
    return secret;
  }

  async revoke(deviceId: string): Promise<void> {
    await this.devices.query(
      `UPDATE devices SET mqtt_secret_hash = NULL, mqtt_credentials_at = NULL WHERE id = $1`,
      [deviceId],
    );
  }

  /** 'ignore' = ไม่ใช่ชื่อผู้ใช้ของอุปกรณ์ (ให้ authenticator อื่นจัดการต่อ) */
  async check(username: string, password: string): Promise<'allow' | 'deny' | 'ignore'> {
    if (!UUID_RE.test(username)) return 'ignore';
    const rows: { mqtt_secret_hash: string | null }[] = await this.devices.query(
      `SELECT mqtt_secret_hash FROM devices WHERE id = $1`,
      [username.toLowerCase()],
    );
    const hash = rows[0]?.mqtt_secret_hash;
    if (!hash || !password) return 'deny';
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(sha256(password), 'hex');
    return a.length === b.length && timingSafeEqual(a, b) ? 'allow' : 'deny';
  }
}
