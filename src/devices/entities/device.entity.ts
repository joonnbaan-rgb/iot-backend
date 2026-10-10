import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum DeviceType {
  SENSOR = 'sensor',
  CAMERA = 'camera',
  ACTUATOR = 'actuator',
}

export enum DeviceStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
}

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: DeviceType })
  type: DeviceType;

  @Column({ type: 'enum', enum: DeviceStatus, default: DeviceStatus.OFFLINE })
  status: DeviceStatus;

  // topic prefix ที่ใช้ใน MQTT เช่น "devices/{id}"
  @Column({ nullable: true })
  location: string;

  // อัปเดตทุกครั้งที่มี telemetry เข้ามา ใช้เช็คว่าอุปกรณ์เงียบหายไปนานแค่ไหน
  @Column({ type: 'timestamptz', nullable: true })
  last_seen_at: Date | null;

  // ใช้เฉพาะ device ประเภท camera: ที่อยู่ RTSP source ของกล้องตัวจริง
  @Column({ type: 'varchar', nullable: true })
  rtsp_url: string | null;

  // อุปกรณ์จริงที่จับคู่ไว้ เช่น { protocol: 'tasmota', host: '192.168.1.50' } (NULL = ไม่ได้จับคู่)
  @Column({ type: 'jsonb', nullable: true })
  connection: { protocol: 'tasmota' | 'sonoff_diy' | 'rtsp'; host: string } | null;

  // เจ้าของอุปกรณ์ (NULL = ไม่มีเจ้าของ เข้าถึงได้เฉพาะ admin)
  @Index()
  @Column({ type: 'uuid', nullable: true })
  owner_id: string | null;

  // ไซต์ที่อุปกรณ์สังกัด (NULL = ไม่สังกัด)
  @Index()
  @Column({ type: 'uuid', nullable: true })
  site_id: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
