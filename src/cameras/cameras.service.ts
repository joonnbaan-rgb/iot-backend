import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Device, DeviceType } from '../devices/entities/device.entity';
import { RecordingsService } from './recordings.service';

export interface StreamUrls {
  hls_url: string;
  webrtc_url: string;
  rtsp_source: string | null;
}

@Injectable()
export class CamerasService {
  private readonly logger = new Logger(CamerasService.name);

  constructor(
    @InjectRepository(Device)
    private readonly deviceRepository: Repository<Device>,
    private readonly configService: ConfigService,
    private readonly recordingsService: RecordingsService,
  ) {}

  /**
   * ตั้ง/แก้ไข RTSP source ของกล้อง แล้วสั่งให้ MediaMTX ไปดึงสตรีมจากกล้องตัวนั้น
   * เรียกซ้ำได้อย่างปลอดภัย (idempotent) เพราะลบ path เดิมก่อนเพิ่มใหม่เสมอ
   */
  async setSource(deviceId: string, rtspUrl: string): Promise<Device> {
    const device = await this.deviceRepository.findOne({ where: { id: deviceId } });
    if (!device) {
      throw new NotFoundException(`ไม่พบอุปกรณ์ id: ${deviceId}`);
    }
    if (device.type !== DeviceType.CAMERA) {
      throw new BadRequestException(`อุปกรณ์ id: ${deviceId} ไม่ใช่ประเภท camera`);
    }

    await this.registerMediaMtxPath(deviceId, rtspUrl);

    device.rtsp_url = rtspUrl;
    return this.deviceRepository.save(device);
  }

  private async registerMediaMtxPath(deviceId: string, rtspUrl: string): Promise<void> {
    const apiUrl = this.configService.get<string>('MEDIAMTX_API_URL', 'http://localhost:9997');
    const recordingsPath = this.configService.get<string>('RECORDINGS_CONTAINER_PATH', '/recordings');

    // ลบ path เดิมก่อน (เผื่อเคยตั้งค่าไว้แล้ว) เพิกเฉย error ถ้ายังไม่เคยมี
    await fetch(`${apiUrl}/v3/config/paths/delete/${deviceId}`, { method: 'DELETE' }).catch(() => undefined);

    const res = await fetch(`${apiUrl}/v3/config/paths/add/${deviceId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: rtspUrl,
        sourceOnDemand: true, // ดึงสตรีมจากกล้องเฉพาะตอนมีคนดู ประหยัด bandwidth กล้อง
        record: true, // อัดคลิปเก็บไว้ตอนที่ path active (ตอนมีคนดูอยู่)
        recordPath: `${recordingsPath}/%path/%Y-%m-%d_%H-%M-%S-%f`,
        recordSegmentDuration: '60s',
        recordFormat: 'fmp4',
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`ตั้งค่า MediaMTX path ล้มเหลว (${res.status}): ${text}`);
    }
    this.logger.log(`ตั้งค่า MediaMTX path "${deviceId}" -> ${rtspUrl} สำเร็จ`);
  }

  /**
   * เก็บกวาดเมื่อลบกล้อง: ลบ path ใน MediaMTX และคลิปที่อัปโหลดไว้ใน MinIO
   * ทำแบบ best-effort ไม่ throw เพื่อไม่ให้การลบอุปกรณ์ล้มเพราะ service ภายนอกไม่พร้อม
   */
  async removeDeviceArtifacts(deviceId: string): Promise<void> {
    const apiUrl = this.configService.get<string>('MEDIAMTX_API_URL', 'http://localhost:9997');
    await fetch(`${apiUrl}/v3/config/paths/delete/${deviceId}`, { method: 'DELETE' }).catch((err) =>
      this.logger.warn(`ลบ MediaMTX path ของ ${deviceId} ไม่สำเร็จ: ${err.message}`),
    );
    await this.recordingsService
      .deleteAllForDevice(deviceId)
      .catch((err) => this.logger.warn(`ลบคลิปของ ${deviceId} ไม่สำเร็จ: ${err.message}`));
  }

  async getStreamUrls(deviceId: string): Promise<StreamUrls> {
    const device = await this.deviceRepository.findOne({ where: { id: deviceId } });
    if (!device) {
      throw new NotFoundException(`ไม่พบอุปกรณ์ id: ${deviceId}`);
    }

    const hlsBase = this.configService.get<string>('MEDIAMTX_PUBLIC_HLS_URL', 'http://localhost:8888');
    const webrtcBase = this.configService.get<string>(
      'MEDIAMTX_PUBLIC_WEBRTC_URL',
      'http://localhost:8889',
    );

    return {
      hls_url: `${hlsBase}/${deviceId}/index.m3u8`,
      webrtc_url: `${webrtcBase}/${deviceId}`,
      rtsp_source: device.rtsp_url,
    };
  }
}
