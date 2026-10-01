import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CommandsService } from './commands.service';
import { CommandRequestDto } from './dto/command-request.dto';

@Controller('devices/:deviceId/commands')
export class CommandsController {
  constructor(private readonly commandsService: CommandsService) {}

  // จำกัดไว้ 20 ครั้งต่อนาทีต่อ IP กันสั่งงานอุปกรณ์ถี่เกินไปโดยไม่ตั้งใจ (เช่น bug ฝั่ง client)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post()
  create(@Param('deviceId') deviceId: string, @Body() body: CommandRequestDto) {
    return this.commandsService.sendCommand(deviceId, body.action);
  }

  @Get()
  findHistory(@Param('deviceId') deviceId: string, @Query('limit') limit?: string) {
    return this.commandsService.findHistory(deviceId, limit ? parseInt(limit, 10) : undefined);
  }

  @Get(':commandId')
  async findOne(@Param('commandId') commandId: string) {
    const command = await this.commandsService.findOne(commandId);
    if (!command) {
      throw new NotFoundException(`ไม่พบคำสั่ง id: ${commandId}`);
    }
    return command;
  }
}
