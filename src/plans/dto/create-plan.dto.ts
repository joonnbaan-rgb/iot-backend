import { ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreatePlanDto {
  // รหัสแพ็กเกจ (ตัวพิมพ์เล็ก ตัวเลข - _) ใช้อ้างอิงภายในระบบ แก้ภายหลังไม่ได้
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]{1,31}$/, { message: 'รหัสแพ็กเกจใช้ a-z 0-9 - _ ยาว 2-32 ตัว' })
  id: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name: string;

  @IsInt() @Min(0) @Max(100000)
  device_quota: number;

  @IsInt() @Min(0) @Max(100000)
  site_quota: number;

  @IsInt() @Min(0) @Max(100000)
  camera_quota: number;

  @IsOptional() @IsBoolean()
  recording_enabled?: boolean;

  @IsOptional() @IsArray() @ArrayUnique() @IsIn(['telegram', 'line', 'email'], { each: true })
  notification_types?: string[];

  @IsOptional() @IsInt() @Min(1) @Max(36500)
  retention_days?: number | null;
}
