import { IsEnum, IsIn, IsIP, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
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

  // จับคู่กับอุปกรณ์จริงที่สแกนเจอในวง LAN
  @IsOptional()
  @IsIn(['tasmota', 'sonoff_diy', 'rtsp'])
  connection_protocol?: 'tasmota' | 'sonoff_diy' | 'rtsp';

  @IsOptional()
  @IsIP(4)
  connection_host?: string;

  // ไซต์ที่จะวางอุปกรณ์ (ไม่ระบุ = ไซต์ส่วนตัวของผู้สร้าง)
  @IsOptional()
  @IsUUID()
  site_id?: string;
}
