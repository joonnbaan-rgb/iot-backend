import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PlansService } from './plans.service';
import { UpdatePlanDto } from './dto/update-plan.dto';
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

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plans.update(id, dto);
  }
}
