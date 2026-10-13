import { IsISO8601, IsIn, IsInt, IsObject, IsOptional, IsString, Min, ValidateIf } from 'class-validator';

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
  @IsString()
  plan_id?: string;

  // ISO 8601; null = ไม่หมดอายุ
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsISO8601()
  plan_expires_at?: string | null;

  // สิทธิ์รายคนทับแพ็กเกจ: { camera_quota, recording_enabled, notification_types, retention_days, retention_unlimited }; null = ล้างทั้งหมด
  @ValidateIf((_, v) => v !== undefined && v !== null)
  @IsObject()
  plan_overrides?: Record<string, unknown> | null;

  @IsOptional()
  @IsIn(['active', 'suspended'])
  status?: 'active' | 'suspended';
}
