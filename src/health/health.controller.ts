import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MqttService } from '../mqtt/mqtt.service';
import * as net from 'net';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';

// health check ต้องไม่ถูก rate limit เพราะระบบ monitoring/load balancer/Kubernetes
// liveness-readiness probe จะยิงเข้ามาถี่ (ทุก 5-10 วินาที) ซึ่งปกติมาก
// ถ้าโดน throttle จะทำให้ระบบดูเหมือน "down" ทั้งที่จริง ๆ ทำงานปกติดี
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly mqttService: MqttService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Get()
  async check() {
    const db = await this.checkDatabase();
    const redis = await this.checkRedis();
    const mqttConnected = this.mqttService.isConnected();

    return {
      status: db && redis && mqttConnected ? 'ok' : 'degraded',
      services: {
        database: db ? 'connected' : 'disconnected',
        redis: redis ? 'connected' : 'disconnected',
        mqtt: mqttConnected ? 'connected' : 'disconnected',
      },
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private checkRedis(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.createConnection({
        host: this.configService.get<string>('REDIS_HOST'),
        port: parseInt(this.configService.get<string>('REDIS_PORT') || '6379', 10),
      });
      socket.setTimeout(2000);
      socket.on('connect', () => {
        socket.end();
        resolve(true);
      });
      socket.on('error', () => resolve(false));
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });
  }
}
