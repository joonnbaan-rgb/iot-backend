import { BadRequestException, Controller, Delete, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { DeviceMode, UserDeletionService } from './user-deletion.service';

@SkipThrottle()
@Controller('users')
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly deletion: UserDeletionService) {}

  // DELETE /users/:id?devices=delete|transfer  (จำเป็นเมื่อผู้ใช้มีอุปกรณ์)
  @Delete(':id')
  remove(
    @CurrentUser() actor: CurrentUserPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('devices') devices?: string,
  ) {
    if (devices !== undefined && devices !== 'delete' && devices !== 'transfer') {
      throw new BadRequestException('devices ต้องเป็น delete หรือ transfer');
    }
    return this.deletion.deleteUser(actor, id, devices as DeviceMode | undefined);
  }
}
