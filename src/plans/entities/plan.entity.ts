import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('plans')
export class Plan {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id: string;

  @Column({ type: 'varchar', length: 64 })
  name: string;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ type: 'int' })
  device_quota: number;

  @Column({ type: 'int' })
  site_quota: number;

  @Column({ type: 'int' })
  camera_quota: number;

  @Column({ type: 'boolean', default: false })
  recording_enabled: boolean;

  @Column({ type: 'text', array: true, default: () => `'{}'` })
  notification_types: string[];

  // null = เก็บไม่จำกัด
  @Column({ type: 'int', nullable: true })
  retention_days: number | null;
}
