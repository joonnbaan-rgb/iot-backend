import { IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { DeviceType } from '../entities/device.entity';

export class CreateDeviceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name: string;

  @IsEnum(DeviceType)
  type: DeviceType;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  location?: string;

  // ใช้เฉพาะ device ประเภท camera
  @IsOptional()
  @Matches(/^rtsps?:\/\/.+/, { message: 'rtsp_url ต้องขึ้นต้นด้วย rtsp:// หรือ rtsps://' })
  @MaxLength(512)
  rtsp_url?: string;
}
