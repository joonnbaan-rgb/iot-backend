import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password_hash: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  // active | suspended (ถูกระงับ: login/refresh ไม่ได้)
  @Column({ type: 'varchar', length: 16, default: 'active' })
  status: 'active' | 'suspended';

  // โควตารายคน (null = ใช้ค่าเริ่มต้นจาก DEFAULT_DEVICE_QUOTA / DEFAULT_SITE_QUOTA) admin ไม่จำกัด
  @Column({ type: 'int', nullable: true })
  device_quota: number | null;

  @Column({ type: 'int', nullable: true })
  site_quota: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  last_login_at: Date | null;

  // null = ยังไม่ยืนยันอีเมล
  @Column({ type: 'timestamptz', nullable: true })
  email_verified_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
