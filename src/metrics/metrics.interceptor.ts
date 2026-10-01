import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from './metrics.service';

// Interceptor เสริม (ไม่บังคับ) — เก็บ http_request_duration_seconds ต่อ request
// วิธีใช้: เพิ่มใน app.module.ts providers:
//   { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor }
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const start = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => this.record(req, res, start),
        error: () => this.record(req, res, start),
      }),
    );
  }

  private record(req: any, res: any, start: bigint) {
    try {
      const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
      const route = req.route?.path || req.url || 'unknown';
      this.metricsService.httpRequestDuration
        .labels(req.method, route, String(res.statusCode))
        .observe(durationSec);
    } catch {
      // อย่าให้ metrics ทำให้ request ล้มเหลว
    }
  }
}
