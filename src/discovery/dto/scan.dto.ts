import { IsOptional, Matches } from 'class-validator';

export class ScanDto {
  // เช่น 192.168.1.0/24 (ถ้าไม่ส่ง ใช้ค่า DISCOVERY_SUBNET ของเซิร์ฟเวอร์)
  @IsOptional()
  @Matches(/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/, { message: 'subnet ต้องอยู่ในรูปแบบ 192.168.1.0/24' })
  subnet?: string;
}
