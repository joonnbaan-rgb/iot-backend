import { Entity, PrimaryColumn } from 'typeorm';

@Entity('device_group_members')
export class DeviceGroupMember {
  @PrimaryColumn({ type: 'uuid' })
  group_id: string;

  @PrimaryColumn({ type: 'uuid' })
  device_id: string;
}
