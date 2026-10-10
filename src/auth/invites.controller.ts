import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { IsEmail, IsInt, IsOptional, Max, Min } from 'class-validator';
import { InvitesService } from './invites.service';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from './decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

class CreateInviteDto {
  // ถ้าระบุ ใบเชิญนี้ใช้สมัครได้เฉพาะอีเมลนี้
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  days?: number;
}

@SkipThrottle()
@Roles(UserRole.ADMIN)
@Controller('invites')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateInviteDto) {
    return this.invites.create(user.sub, dto.email, dto.days ?? 7);
  }

  @Get()
  list() {
    return this.invites.list();
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.invites.remove(id);
  }
}
