import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  user_id: string;

  // เก็บ SHA-256 hash ของ refresh token ไม่เก็บ token จริง (เผื่อฐานข้อมูลรั่วจะเอาไป login แทนไม่ได้)
  @Index()
  @Column()
  token_hash: string;

  @Column({ type: 'timestamptz' })
  expires_at: Date;

  // มีค่าเมื่อถูก revoke แล้ว (logout หรือถูกใช้ไปแล้วตอน refresh แบบ rotate)
  @Column({ type: 'timestamptz', nullable: true })
  revoked_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
