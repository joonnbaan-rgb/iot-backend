import { ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  device_quota?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  site_quota?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  camera_quota?: number;

  @IsOptional()
  @IsBoolean()
  recording_enabled?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(['telegram', 'line', 'email'], { each: true })
  notification_types?: string[];

  // null = ไม่จำกัด
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(36500)
  retention_days?: number | null;
}
