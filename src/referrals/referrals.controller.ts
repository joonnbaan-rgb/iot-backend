import { Body, Controller, Get, Put } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ReferralsService } from './referrals.service';
import { UpdateReferralSettingsDto } from './dto/referral-settings.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

@SkipThrottle()
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  /** รหัสแนะนำของฉัน สถิติ และรายละเอียดโปรโมชัน */
  @Get('me')
  me(@CurrentUser() user: CurrentUserPayload) {
    return this.referrals.me(user.sub);
  }

  @Get('settings')
  @Roles(UserRole.ADMIN)
  settings() {
    return this.referrals.getSettings();
  }

  @Put('settings')
  @Roles(UserRole.ADMIN)
  updateSettings(@Body() dto: UpdateReferralSettingsDto) {
    return this.referrals.updateSettings(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  list() {
    return this.referrals.list();
  }
}
