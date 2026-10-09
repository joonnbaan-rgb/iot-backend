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
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';

// ทุก endpoint ในนี้ต้อง login จึงใช้ UserThrottlerGuard (แยกตาม user) แทน IP-based guard
@SkipThrottle()
@Controller('rules')
export class RulesController {
  constructor(private readonly rulesService: RulesService) {}

  @Post()
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateRuleDto) {
    return this.rulesService.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.rulesService.findAllFor(user);
  }

  @Get(':id')
  findOne(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.rulesService.findOneFor(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Body() dto: UpdateRuleDto) {
    return this.rulesService.updateFor(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return this.rulesService.removeFor(user, id);
  }

  @Get(':id/logs')
  findLogs(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string, @Query('limit') limit?: string) {
    return this.rulesService.findLogsFor(user, id, limit ? parseInt(limit, 10) : undefined);
  }
}
