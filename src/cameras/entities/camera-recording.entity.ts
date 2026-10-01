import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('camera_recordings')
export class CameraRecording {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  device_id: string;

  // key ของไฟล์ใน MinIO bucket เช่น "{deviceId}/2026-09-28_10-00-00.mp4"
  @Column()
  object_key: string;

  @Column({ type: 'bigint', nullable: true })
  file_size_bytes: number | null;

  @Column({ type: 'timestamptz' })
  recorded_at: Date;

  @CreateDateColumn()
  created_at: Date;
}
