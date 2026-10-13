import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plan } from './entities/plan.entity';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';

/** @Global: โมดูลอื่น (โควตา, กล้อง, แจ้งเตือน, ผู้ใช้) inject PlansService ได้โดยไม่ต้อง import */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Plan])],
  controllers: [PlansController],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
