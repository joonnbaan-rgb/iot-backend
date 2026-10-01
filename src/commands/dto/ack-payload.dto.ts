import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export enum AckStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
}

export class AckPayloadDto {
  @IsUUID()
  command_id: string;

  @IsEnum(AckStatus)
  status: AckStatus;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  message?: string;
}
