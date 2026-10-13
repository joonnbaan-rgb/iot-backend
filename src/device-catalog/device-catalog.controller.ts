import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DeviceCatalogService } from './device-catalog.service';
import { CreateProfileDto, UpdateProfileDto } from './dto/profile.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

@SkipThrottle()
@Controller('device-profiles')
export class DeviceCatalogController {
  constructor(private readonly catalog: DeviceCatalogService) {}

  /** แคตตาล็อกรุ่นอุปกรณ์ (ทุกคนที่ล็อกอินเรียกได้); admin ส่ง all=1 เพื่อดูรายการที่ปิดไว้ด้วย */
  @Get()
  list(
    @CurrentUser() user: CurrentUserPayload,
    @Query('type') type?: string,
    @Query('q') q?: string,
    @Query('all') all?: string,
  ) {
    return this.catalog.list({ type, q, includeDisabled: all === '1' && user.role === UserRole.ADMIN });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.catalog.get(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateProfileDto) {
    return this.catalog.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateProfileDto) {
    return this.catalog.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(UserRole.ADMIN)
  async remove(@Param('id') id: string): Promise<void> {
    await this.catalog.remove(id);
  }
}
