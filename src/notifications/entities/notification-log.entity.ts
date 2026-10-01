import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum NotificationStatus {
  SENT = 'sent',
  FAILED = 'failed',
  SKIPPED = 'skipped', // ยังไม่ได้ตั้งค่าช่องทางแจ้งเตือนไว้
}

@Entity('notification_logs')
export class NotificationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  channel: string; // 'telegram'

  @Column()
  event_type: string; // 'device_offline' | 'rule_triggered' | 'command_timeout'

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'varchar' })
  status: NotificationStatus;

  @Column({ type: 'varchar', nullable: true })
  error: string | null;

  @CreateDateColumn()
  created_at: Date;
}
