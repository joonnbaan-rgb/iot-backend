import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type SharePermission = 'view' | 'control';

@Entity('device_shares')
export class DeviceShare {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  owner_id: string;

  @Index()
  @Column({ type: 'uuid' })
  shared_with_id: string;

  @Column({ type: 'uuid', nullable: true })
  device_id: string | null;

  @Column({ type: 'uuid', nullable: true })
  group_id: string | null;

  @Column({ type: 'varchar', default: 'view' })
  permission: SharePermission;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
