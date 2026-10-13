import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ProfileField, ProfileLink, ProfileSnippet, RtspTemplate } from '../entities/device-profile.entity';

export class CreateProfileDto {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]{1,63}$/, { message: 'รหัสโปรไฟล์ใช้ a-z 0-9 - _ ยาว 2-64 ตัว' })
  id: string;

  @IsString() @MinLength(1) @MaxLength(64)
  vendor: string;

  @IsString() @MinLength(1) @MaxLength(128)
  model: string;

  @IsIn(['sensor', 'camera', 'actuator'])
  device_type: 'sensor' | 'camera' | 'actuator';

  @IsIn(['rtsp', 'mqtt'])
  protocol: 'rtsp' | 'mqtt';

  @IsIn(['rtsp', 'direct', 'script', 'rule', 'bridge', 'planned'])
  integration: 'rtsp' | 'direct' | 'script' | 'rule' | 'bridge' | 'planned';

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @IsString() @MaxLength(128)
  default_name?: string;

  @IsOptional() @IsString() @MaxLength(32)
  default_unit?: string | null;

  @IsOptional() @IsArray() @ArrayMaxSize(30)
  fields?: ProfileField[];

  @IsOptional() @IsArray() @ArrayMaxSize(30)
  rtsp_templates?: RtspTemplate[];

  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true })
  steps?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(20)
  snippets?: ProfileSnippet[];

  @IsOptional() @IsArray() @ArrayMaxSize(20)
  links?: ProfileLink[];

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true })
  tags?: string[];
}

export class UpdateProfileDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(64)
  vendor?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(128)
  model?: string;

  @IsOptional() @IsIn(['sensor', 'camera', 'actuator'])
  device_type?: 'sensor' | 'camera' | 'actuator';

  @IsOptional() @IsIn(['rtsp', 'mqtt'])
  protocol?: 'rtsp' | 'mqtt';

  @IsOptional() @IsIn(['rtsp', 'direct', 'script', 'rule', 'bridge', 'planned'])
  integration?: 'rtsp' | 'direct' | 'script' | 'rule' | 'bridge' | 'planned';

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @IsString() @MaxLength(128)
  default_name?: string;

  @IsOptional() @IsString() @MaxLength(32)
  default_unit?: string | null;

  @IsOptional() @IsArray() @ArrayMaxSize(30)
  fields?: ProfileField[];

  @IsOptional() @IsArray() @ArrayMaxSize(30)
  rtsp_templates?: RtspTemplate[];

  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true })
  steps?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(20)
  snippets?: ProfileSnippet[];

  @IsOptional() @IsArray() @ArrayMaxSize(20)
  links?: ProfileLink[];

  @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true })
  tags?: string[];

  @IsOptional() @IsBoolean()
  enabled?: boolean;
}
