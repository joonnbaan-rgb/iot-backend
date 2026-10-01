import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { RulesService } from './rules.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';

// ทุก endpoint ในนี้ต้อง login จึงใช้ UserThrottlerGuard (แยกตาม user) แทน IP-based guard
@SkipThrottle()
@Controller('rules')
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Post()
  create(@Body() dto: CreateRuleDto) {
    return this.rulesService.create(dto);
  }

  @Get()
  findAll() {
    return this.rulesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rulesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateRuleDto) {
    return this.rulesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rulesService.remove(id);
  }

  @Get(':id/logs')
  findLogs(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.rulesService.findLogs(id, limit ? parseInt(limit, 10) : undefined);
  }
}
