import { IsISO8601, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class TelemetryPayloadDto {
  @IsNumber()
  value: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  unit?: string;

  // ถ้าอุปกรณ์ไม่ส่งเวลามา จะใช้เวลาที่ backend รับ message แทน
  @IsOptional()
  @IsISO8601()
  recorded_at?: string;
}
