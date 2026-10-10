import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

export type SiteRole = 'admin' | 'operator' | 'viewer';

@Entity('site_members')
export class SiteMember {
  @PrimaryColumn('uuid')
  site_id: string;

  @PrimaryColumn('uuid')
  user_id: string;

  @Column({ type: 'varchar', length: 16 })
  role: SiteRole;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
