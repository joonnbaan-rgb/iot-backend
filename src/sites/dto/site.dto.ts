import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSiteDto {
  @IsString() @IsNotEmpty() @MaxLength(128)
  name: string;

  @IsIn(['home', 'farm', 'factory'])
  kind: 'home' | 'farm' | 'factory';
}

export class UpdateSiteDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(128)
  name?: string;

  @IsOptional() @IsIn(['home', 'farm', 'factory'])
  kind?: 'home' | 'farm' | 'factory';
}

export class AddMemberDto {
  @IsEmail()
  email: string;

  @IsIn(['admin', 'operator', 'viewer'])
  role: 'admin' | 'operator' | 'viewer';
}

export class UpdateMemberDto {
  @IsIn(['admin', 'operator', 'viewer'])
  role: 'admin' | 'operator' | 'viewer';
}
