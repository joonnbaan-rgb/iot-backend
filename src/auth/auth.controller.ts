import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto, ForgotPasswordDto, ResetPasswordDto, VerifyEmailDto } from './dto/password.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // กันสมัครรัวๆ จาก IP เดียว (โหมด open): 10 ครั้ง/10 นาที
  @Throttle({ default: { limit: 10, ttl: 600000 } })
  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // จำกัดไว้ 5 ครั้งต่อนาทีต่อ IP กัน brute-force รหัสผ่าน
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refresh_token);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Body() dto: RefreshTokenDto) {
    await this.authService.logout(dto.refresh_token);
    return { message: 'ออกจากระบบสำเร็จ' };
  }

  @Public()
  @Get('config')
  config() {
    return this.authService.publicConfig();
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('verify-email')
  async verify(@Body() dto: VerifyEmailDto) {
    await this.authService.verifyEmail(dto.email, dto.code);
    return { message: 'ยืนยันอีเมลสำเร็จ' };
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('resend-verification')
  async resend(@Body() dto: ForgotPasswordDto) {
    await this.authService.resendVerification(dto.email);
    return { message: 'ถ้าอีเมลนี้รอการยืนยันอยู่ เราได้ส่งรหัสใหม่ไปให้แล้ว' };
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgot(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return { message: 'ถ้าอีเมลนี้มีในระบบ เราได้ส่งรหัสยืนยันไปให้แล้ว' };
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  async reset(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.email, dto.code, dto.new_password);
    return { message: 'ตั้งรหัสผ่านใหม่สำเร็จ' };
  }

  @HttpCode(HttpStatus.OK)
  @Post('change-password')
  async change(@CurrentUser() user: CurrentUserPayload, @Body() dto: ChangePasswordDto) {
    await this.authService.changePassword(user.sub, dto.current_password, dto.new_password);
    return { message: 'เปลี่ยนรหัสผ่านสำเร็จ' };
  }

  @Get('usage')
  usage(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.usage(user.sub);
  }

  @Get('me')
  me(@CurrentUser() user: CurrentUserPayload) {
    return user;
  }
}
