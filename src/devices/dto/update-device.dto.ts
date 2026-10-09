import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// แก้ได้เฉพาะชื่อกับตำแหน่ง: type เปลี่ยนไม่ได้ (จะทำให้ข้อมูล telemetry/คำสั่งเดิมไม่ตรงกับชนิดอุปกรณ์)
// ส่วน RTSP source ของกล้องตั้งผ่าน PUT /devices/:id/camera
export class UpdateDeviceDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  location?: string;
}
