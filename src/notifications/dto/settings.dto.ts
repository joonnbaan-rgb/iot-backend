import { ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';
import { ALL_EVENTS } from '../entities/notification-settings.entity';

export class UpdateSettingsDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(ALL_EVENTS as unknown as string[], { each: true })
  events?: string[];

  // ชั่วโมง 0-23 หรือ null (ปิดช่วงเงียบ) ต้องส่งคู่กัน
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(23)
  quiet_start?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(0)
  @Max(23)
  quiet_end?: number | null;
}

export class UpdateChannelDto {
  @IsBoolean()
  enabled: boolean;
}
