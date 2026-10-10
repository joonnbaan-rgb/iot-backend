import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export const ALL_EVENTS = ['device_offline', 'rule_triggered', 'command_timeout'] as const;

@Entity('notification_settings')
export class NotificationSettings {
  @PrimaryColumn('uuid')
  user_id: string;

  @Column({ type: 'text', array: true, default: () => `ARRAY['device_offline','rule_triggered','command_timeout']` })
  events: string[];

  /** ช่วงเวลาเงียบเป็นชั่วโมง 0-23 (เวลาท้องถิ่น NOTIFY_TZ) ช่วงข้ามเที่ยงคืนได้ เช่น 22 → 7; NULL = ไม่เงียบ */
  @Column({ type: 'smallint', nullable: true })
  quiet_start: number | null;

  @Column({ type: 'smallint', nullable: true })
  quiet_end: number | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
