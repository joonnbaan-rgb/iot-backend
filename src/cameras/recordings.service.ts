import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import { Client as MinioClient } from 'minio';
import { CameraRecording } from './entities/camera-recording.entity';

const BUCKET_NAME = 'camera-recordings';

@Injectable()
export class RecordingsService implements OnModuleInit {
  private readonly logger = new Logger(RecordingsService.name);
  private minioClient: MinioClient;
  private readonly recordingsDir: string;

  constructor(
    @InjectRepository(CameraRecording)
    private readonly recordingRepository: Repository<CameraRecording>,
    private readonly configService: ConfigService,
  ) {
    this.recordingsDir = this.configService.get<string>('RECORDINGS_DIR', './recordings');
  }

  async onModuleInit() {
    this.minioClient = new MinioClient({
      endPoint: this.configService.get<string>('MINIO_ENDPOINT', 'localhost'),
      port: parseInt(this.configService.get<string>('MINIO_PORT', '9000'), 10),
      useSSL: false,
      accessKey: this.configService.get<string>('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: this.configService.get<string>('MINIO_SECRET_KEY', 'minioadmin123'),
    });

    try {
      const exists = await this.minioClient.bucketExists(BUCKET_NAME);
      if (!exists) {
        await this.minioClient.makeBucket(BUCKET_NAME);
        this.logger.log(`สร้าง MinIO bucket "${BUCKET_NAME}" สำเร็จ`);
      }
    } catch (err) {
      this.logger.error(`เชื่อมต่อหรือสร้าง MinIO bucket ล้มเหลว: ${err.message}`);
    }
  }

  /**
   * ทุก 15 วินาที: สแกนโฟลเดอร์ recordings หาไฟล์คลิปใหม่ที่ MediaMTX เขียนไว้
   * (โฟลเดอร์นี้ mount ร่วมกันระหว่าง container mediamtx กับ backend)
   * ไฟล์ไหนยังไม่เคยอัปโหลด (เช็คจาก object_key ใน DB) ให้อัปขึ้น MinIO แล้วบันทึกไว้
   */
  @Interval(15000)
  async scanForNewRecordings(): Promise<void> {
    if (!fs.existsSync(this.recordingsDir)) {
      return; // ยังไม่มีโฟลเดอร์ (ยังไม่เคยมีการอัดคลิปเลย) ข้ามไปเงียบๆ
    }

    let deviceFolders: string[];
    try {
      deviceFolders = fs
        .readdirSync(this.recordingsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch (err) {
      this.logger.error(`อ่านโฟลเดอร์ recordings ล้มเหลว: ${err.message}`);
      return;
    }

    for (const deviceId of deviceFolders) {
      await this.scanDeviceFolder(deviceId);
    }
  }

  private async scanDeviceFolder(deviceId: string): Promise<void> {
    const deviceDir = path.join(this.recordingsDir, deviceId);
    let files: string[];
    try {
      files = fs.readdirSync(deviceDir).filter((f) => f.endsWith('.mp4'));
    } catch {
      return;
    }

    for (const filename of files) {
      const objectKey = `${deviceId}/${filename}`;
      const alreadyUploaded = await this.recordingRepository.findOne({ where: { object_key: objectKey } });
      if (alreadyUploaded) continue;

      const filePath = path.join(deviceDir, filename);
      const stat = fs.statSync(filePath);

      // ไฟล์ที่ MediaMTX ยังเขียนไม่เสร็จจะมีขนาดเปลี่ยนอยู่เรื่อยๆ รอรอบถัดไปค่อยเช็คใหม่
      // (heuristic ง่ายๆ: ถ้าไฟล์เพิ่งแก้ไขภายใน 5 วินาทีที่ผ่านมา ถือว่ายังเขียนไม่เสร็จ)
      const modifiedSecondsAgo = (Date.now() - stat.mtimeMs) / 1000;
      if (modifiedSecondsAgo < 5) continue;

      try {
        await this.minioClient.fPutObject(BUCKET_NAME, objectKey, filePath);
        await this.recordingRepository.save(
          this.recordingRepository.create({
            device_id: deviceId,
            object_key: objectKey,
            file_size_bytes: stat.size,
            recorded_at: stat.mtime,
          }),
        );
        this.logger.log(`อัปโหลดคลิป "${objectKey}" ขึ้น MinIO สำเร็จ (${(stat.size / 1024).toFixed(0)} KB)`);
      } catch (err) {
        this.logger.error(`อัปโหลดคลิป "${objectKey}" ล้มเหลว: ${err.message}`);
      }
    }
  }

  async listRecordings(deviceId: string, limit = 50) {
    const recordings = await this.recordingRepository.find({
      where: { device_id: deviceId },
      order: { recorded_at: 'DESC' },
      take: Math.min(limit, 200),
    });

    // สร้าง presigned URL ให้แต่ละคลิป (หมดอายุใน 1 ชั่วโมง) เพื่อดู/ดาวน์โหลดได้โดยตรง
    return Promise.all(
      recordings.map(async (r) => ({
        id: r.id,
        recorded_at: r.recorded_at,
        file_size_bytes: r.file_size_bytes,
        download_url: await this.minioClient
          .presignedGetObject(BUCKET_NAME, r.object_key, 60 * 60)
          .catch(() => null),
      })),
    );
  }

  /** ลบไฟล์คลิปของกล้องตัวหนึ่งออกจาก MinIO (แถวใน DB ถูกลบตาม ON DELETE CASCADE ตอนลบอุปกรณ์) */
  async deleteAllForDevice(deviceId: string): Promise<void> {
    const rows = await this.recordingRepository.find({ where: { device_id: deviceId } });
    if (rows.length === 0) return;
    await this.minioClient.removeObjects(
      BUCKET_NAME,
      rows.map((r) => r.object_key),
    );
  }
}
