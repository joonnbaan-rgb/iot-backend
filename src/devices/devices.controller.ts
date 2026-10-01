import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DevicesService } from './devices.service';
import { Device } from './entities/device.entity';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

// ทุก endpoint ในนี้ต้อง login (ไม่มี @Public()) จึงใช้ UserThrottlerGuard
// (จำกัดโควตาแยกตาม user) แทน global IP-based ThrottlerGuard
@SkipThrottle()
@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  findAll(): Promise<Device[]> {
    return this.devicesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string): Promise<Device> {
    return this.devicesService.findOne(id);
  }

  // เฉพาะ admin เท่านั้นที่แก้ device registry ได้ (เพิ่มอุปกรณ์ใหม่เข้าระบบ)
  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() body: Partial<Device>): Promise<Device> {
    return this.devicesService.create(body);
  }
}
