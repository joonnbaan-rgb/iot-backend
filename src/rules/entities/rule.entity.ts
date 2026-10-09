import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum RuleOperator {
  GT = '>',
  LT = '<',
  GTE = '>=',
  LTE = '<=',
  EQ = '==',
  NEQ = '!=',
}

@Entity('rules')
export class Rule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  name: string;

  // เซนเซอร์ที่จะใช้ค่ามาเช็คเงื่อนไข
  @Index()
  @Column()
  sensor_device_id: string;

  @Column({ type: 'varchar' })
  operator: RuleOperator;

  @Column({ type: 'float' })
  threshold: number;

  // อุปกรณ์ที่จะถูกสั่งงานเมื่อเงื่อนไขตรง
  @Column()
  target_device_id: string;

  @Column()
  action: string; // เช่น "turn_on", "turn_off"

  @Column({ default: true })
  enabled: boolean;

  // ระยะเวลาขั้นต่ำ (วินาที) ก่อนจะยอมให้ rule นี้สั่งงานซ้ำอีกครั้ง
  @Column({ default: 60 })
  cooldown_seconds: number;

  @Column({ type: 'timestamptz', nullable: true })
  last_triggered_at: Date | null;

  // ผู้สร้าง/เจ้าของ rule (NULL = เข้าถึงได้เฉพาะ admin)
  @Index()
  @Column({ type: 'uuid', nullable: true })
  owner_id: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
