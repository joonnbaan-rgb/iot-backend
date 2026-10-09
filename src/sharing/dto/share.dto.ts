import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsIn, IsOptional, IsUUID } from 'class-validator';

export class CreateShareDto {
  @IsEmail()
  email: string;

  @IsIn(['view', 'control'])
  permission: 'view' | 'control';

  // all = ทุกอุปกรณ์ของฉัน (รวมที่เพิ่มทีหลัง), devices = เลือกบางอุปกรณ์, group = ทั้งกลุ่ม
  @IsIn(['all', 'devices', 'group'])
  scope: 'all' | 'devices' | 'group';

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  device_ids?: string[];

  @IsOptional()
  @IsUUID()
  group_id?: string;
}

export class UpdateShareDto {
  @IsIn(['view', 'control'])
  permission: 'view' | 'control';
}
