import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

export type ChannelType = 'telegram' | 'line' | 'email';

@Entity('notification_channels')
@Unique(['user_id', 'type', 'target'])
export class NotificationChannel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  user_id: string;

  @Column({ type: 'varchar', length: 16 })
  type: ChannelType;

  /** Telegram chat id / LINE userId / อีเมล */
  @Column({ type: 'varchar', length: 255 })
  target: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  label: string | null;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
