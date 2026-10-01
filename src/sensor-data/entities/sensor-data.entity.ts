import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('sensor_data')
export class SensorData {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  device_id: string;

  @Column({ type: 'float' })
  value: number;

  @Column({ nullable: true })
  unit: string;

  @Index()
  @Column({ type: 'timestamptz' })
  recorded_at: Date;
}
