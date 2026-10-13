import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PlansService } from './plans.service';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@SkipThrottle()
@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  /** รายการแพ็กเกจและข้อจำกัด (ผู้ใช้ที่ล็อกอินดูได้ ใช้เทียบแพ็กเกจในแอป) */
  @Get()
  list() {
    return this.plans.list();
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreatePlanDto) {
    return this.plans.create(dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(UserRole.ADMIN)
  async remove(@Param('id') id: string): Promise<void> {
    await this.plans.remove(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plans.update(id, dto);
  }
}
