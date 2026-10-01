import {
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

export class CreateRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  @IsUUID()
  sensor_device_id: string;

  @IsEnum(RuleOperator)
  operator: RuleOperator;

  @IsNumber()
  threshold: number;

  @IsUUID()
  target_device_id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  action: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86400)
  cooldown_seconds?: number;
}
