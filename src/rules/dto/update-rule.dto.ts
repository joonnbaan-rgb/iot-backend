import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { RuleOperator } from '../entities/rule.entity';

export class UpdateRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsUUID()
  sensor_device_id?: string;

  @IsOptional()
  @IsEnum(RuleOperator)
  operator?: RuleOperator;

  @IsOptional()
  @IsNumber()
  threshold?: number;

  @IsOptional()
  @IsUUID()
  target_device_id?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  action?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86400)
  cooldown_seconds?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
