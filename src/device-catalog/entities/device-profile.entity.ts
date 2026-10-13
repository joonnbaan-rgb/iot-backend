import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export interface ProfileField {
  key: string;
  label: string;
  default?: string;
  placeholder?: string;
  secret?: boolean;
}
export interface RtspTemplate { label: string; url: string }
export interface ProfileSnippet { title: string; language: string; code: string }
export interface ProfileLink { title: string; url: string }

/**
 * โปรไฟล์อุปกรณ์ในแคตตาล็อก ข้อความใน steps/snippets/rtsp_templates ใช้ {{ตัวแปร}}:
 *  - จากช่อง fields (เช่น {{ip}} {{username}})
 *  - ตัวแปรระบบ: {{device_id}} {{mqtt_host}} {{mqtt_port}} {{mqtt_user}} {{mqtt_password}} {{telemetry_topic}} {{command_topic}} {{ack_topic}}
 * integration: rtsp = กล้อง RTSP | direct = เฟิร์มแวร์ส่ง/รับตามโปรโตคอลของระบบตรงๆ | script = สคริปต์ในตัวอุปกรณ์
 *              rule = กฎในเฟิร์มแวร์ (ส่งข้อมูลอย่างเดียว) | bridge = ต้องมีตัวกลาง (Node-RED ฯลฯ) | planned = ยังไม่รองรับเต็มรูปแบบ
 */
@Entity('device_profiles')
export class DeviceProfile {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id: string;

  @Column({ type: 'varchar', length: 64 })
  vendor: string;

  @Column({ type: 'varchar', length: 128 })
  model: string;

  @Column({ type: 'varchar', length: 16 })
  device_type: 'sensor' | 'camera' | 'actuator';

  @Column({ type: 'varchar', length: 16 })
  protocol: 'rtsp' | 'mqtt';

  @Column({ type: 'varchar', length: 16 })
  integration: 'rtsp' | 'direct' | 'script' | 'rule' | 'bridge' | 'planned';

  @Column({ type: 'text', default: '' })
  description: string;

  @Column({ type: 'varchar', length: 128, default: '' })
  default_name: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  default_unit: string | null;

  @Column({ type: 'jsonb', default: () => `'[]'` })
  fields: ProfileField[];

  @Column({ type: 'jsonb', default: () => `'[]'` })
  rtsp_templates: RtspTemplate[];

  @Column({ type: 'jsonb', default: () => `'[]'` })
  steps: string[];

  @Column({ type: 'jsonb', default: () => `'[]'` })
  snippets: ProfileSnippet[];

  @Column({ type: 'jsonb', default: () => `'[]'` })
  links: ProfileLink[];

  @Column({ type: 'text', default: '' })
  notes: string;

  @Column({ type: 'text', array: true, default: () => `'{}'` })
  tags: string[];

  @Column({ type: 'varchar', length: 8, default: 'custom' })
  source: 'builtin' | 'custom';

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
