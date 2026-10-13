import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateReferralSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  // วันที่ผู้แนะนำได้ต่อผู้ถูกแนะนำ 1 คน
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  inviter_days?: number;

  // วันที่ผู้ถูกแนะนำได้ตอนสมัคร
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  invitee_days?: number;

  // แพ็กเกจที่ให้ใช้ในช่วงโปรโมชัน (สำหรับผู้ใช้ Free/หมดอายุ)
  @IsOptional()
  @IsString()
  reward_plan?: string;

  // จำกัดจำนวนคนที่ได้รับรางวัลต่อผู้แนะนำ 1 คน (0 = ไม่จำกัด)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  max_rewards_per_user?: number;
}
