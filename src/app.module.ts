import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { dataSourceOptions } from './config/data-source';
import { DevicesModule } from './devices/devices.module';
import { MqttModule } from './mqtt/mqtt.module';
import { HealthModule } from './health/health.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { SensorDataModule } from './sensor-data/sensor-data.module';
import { CommandsModule } from './commands/commands.module';
import { RulesModule } from './rules/rules.module';
import { CamerasModule } from './cameras/cameras.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { RealtimeModule } from './realtime/realtime.module';
import { NotificationsModule } from './notifications/notifications.module';
import { MetricsModule } from './metrics/metrics.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsInterceptor } from './metrics/metrics.interceptor';
import { DiscoveryModule } from './discovery/discovery.module';
import { SharingModule } from './sharing/sharing.module';
import { SitesModule } from './sites/sites.module';
import { UserThrottlerGuard } from './common/guards/user-throttler.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(), // เปิดใช้ @Interval/@Cron สำหรับ offline watcher ใน IngestionService
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]), // ค่า default: 100 request/นาที/IP ทั้งระบบ
    TypeOrmModule.forRoot(dataSourceOptions),
    AuthModule,
    UsersModule,
    DevicesModule,
    RulesModule,
    IngestionModule,
    MqttModule,
    SensorDataModule,
    CommandsModule,
    CamerasModule,
    RealtimeModule,
    NotificationsModule,
    SharingModule,
    SitesModule,
    DiscoveryModule,
    HealthModule,
    MetricsModule,
  ],
  providers: [
    // ลำดับสำคัญ: rate limit ตาม IP (คุ้มครอง endpoint สาธารณะ เช่น login) ->
    // ตรวจ JWT (ทำให้ req.user พร้อมใช้) -> ตรวจ role -> rate limit ตาม user
    // (สำหรับ endpoint ที่ login แล้วและถูก @SkipThrottle() ออกจากตัวแรก)
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: UserThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor }
  ],
})
export class AppModule { }
