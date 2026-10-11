import { Body, Controller, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { UsersService } from './users.service';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { UserRole } from './entities/user.entity';

// ทุก endpoint ในนี้ต้อง login จึงใช้ UserThrottlerGuard (แยกตาม user) แทน IP-based guard
@SkipThrottle()
@Controller('users')
@Roles(UserRole.ADMIN) // ทุก endpoint ในนี้ admin เท่านั้นที่เข้าได้
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id/devices')
  devicesOf(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.listDevicesOf(id);
  }

  @Get(':id/usage')
  usageOf(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.usage(id);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.update(actor.sub, id, dto);
  }

  @Patch(':id/role')
  updateRole(@Param('id') id: string, @Body() dto: UpdateUserRoleDto) {
    return this.usersService.updateRole(id, dto.role);
  }
}
