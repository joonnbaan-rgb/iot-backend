import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { CommandsService } from './commands.service';
import { CommandRequestDto } from './dto/command-request.dto';

@Controller('devices/:deviceId/commands')
export class CommandsController {
  constructor(private readonly commandsService: CommandsService) {}

  // คงการจำกัด 20 ครั้งต่อนาทีต่อ IP ไว้เหมือนเดิม (กันสั่งงานอุปกรณ์ถี่เกินไปโดยไม่ตั้งใจ
  // เช่น bug ฝั่ง client) — endpoint นี้จงใจไม่ใช้ UserThrottlerGuard เพราะต้องการจำกัด
  // แบบ cross-user ต่อ IP จริง ๆ (กันเคสหลาย user/อุปกรณ์ที่ IP เดียวกันช่วยกันสแปม)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post()
  create(@Param('deviceId') deviceId: string, @Body() body: CommandRequestDto) {
    return this.commandsService.sendCommand(deviceId, body.action);
  }

  // GET endpoints เป็น read-only ไม่มี abuse risk แบบ POST ด้านบน จึงใช้ UserThrottlerGuard
  // (แยกโควตาตาม user) แทน IP-based guard เหมือน controller อื่น ๆ
  @SkipThrottle()
  @Get()
  findHistory(@Param('deviceId') deviceId: string, @Query('limit') limit?: string) {
    return this.commandsService.findHistory(deviceId, limit ? parseInt(limit, 10) : undefined);
  }

  @SkipThrottle()
  @Get(':commandId')
  async findOne(@Param('commandId') commandId: string) {
    const command = await this.commandsService.findOne(commandId);
    if (!command) {
      throw new NotFoundException(`ไม่พบคำสั่ง id: ${commandId}`);
    }
    return command;
  }
}
