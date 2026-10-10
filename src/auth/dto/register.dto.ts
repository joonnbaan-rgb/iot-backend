import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(8, { message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' })
  @MaxLength(128)
  password: string;

  // รหัสเชิญ (จำเป็นเมื่อเซิร์ฟเวอร์ตั้ง REGISTRATION_MODE=invite)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  invite_code?: string;
}
