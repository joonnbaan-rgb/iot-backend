import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('rule_execution_logs')
export class RuleExecutionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  rule_id: string;

  @Column({ type: 'float' })
  sensor_value: number;

  @Column()
  triggered: boolean;

  // มีค่าเมื่อ rule สั่งงานจริงและสร้าง device_command ขึ้นมา
  @Column({ nullable: true })
  command_id: string;

  // เหตุผลที่เงื่อนไขตรงแต่ "ไม่ได้" สั่งงาน เช่น "cooldown" หรือ "error: ..."
  @Column({ nullable: true })
  skipped_reason: string;

  @CreateDateColumn()
  created_at: Date;
}
