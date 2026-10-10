import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type SiteKind = 'home' | 'farm' | 'factory';

@Entity('sites')
export class Site {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  @Column({ type: 'varchar', length: 16, default: 'home' })
  kind: SiteKind;

  @Column({ type: 'boolean', default: false })
  is_personal: boolean;

  @Column({ type: 'uuid' })
  created_by: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
