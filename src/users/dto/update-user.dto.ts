import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateUserDto {
  // null = กลับไปใช้ค่าเริ่มต้นของระบบ
  @IsOptional()
  @IsInt()
  @Min(0)
  device_quota?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  site_quota?: number | null;

  @IsOptional()
  @IsIn(['active', 'suspended'])
  status?: 'active' | 'suspended';
}
