import { CanActivate, ExecutionContext, Injectable, TooManyRequestsException } from '@nestjs/common';

/**
 * Rate limit แยกตาม "ผู้ใช้ที่ login แล้ว" (user id จาก JWT) แทนที่จะนับรวมตาม IP
 *
 * ปัญหาที่แก้: ThrottlerGuard ของ @nestjs/throttler (global guard ตัวแรก) นับ request
 * รวมกันตาม IP ที่มาถึง ซึ่งมีปัญหาจริงกับระบบ IoT ลักษณะนี้ — ถ้าอุปกรณ์/ผู้ใช้หลายตัว
 * อยู่หลัง NAT หรือ gateway เดียวกัน (IP เดียวกัน) จะถูกนับรวมกันและโดน throttle ปนกัน
 * ทั้งที่แต่ละตัวใช้งานไม่เกินโควตาของตัวเอง (ยืนยันจากการรัน load test: k6 จำลอง 20 VU
 * จาก IP เดียว แล้วโดน throttle หลังจากผ่านแค่ 100 request แรก)
 *
 * Endpoint ที่ "ต้อง login" (ไม่มี @Public()) จะถูก @SkipThrottle() ออกจาก global
 * ThrottlerGuard แล้วมาใช้ guard ตัวนี้แทน ซึ่งนับโควตาแยกเป็นรายคน (ตาม user id)
 * ส่วน endpoint สาธารณะ (auth/login, auth/register, health, metrics) ยังถูกป้องกันด้วย
 * global ThrottlerGuard ตาม IP เหมือนเดิม (จำเป็น เพราะยังไม่รู้ว่าใครเป็นใครก่อน login)
 *
 * หมายเหตุ implementation: ใช้ in-memory Map เก็บ counter ต่อ process เท่านั้น ถ้า scale
 * เป็นหลาย instance ในอนาคต ควรย้ายไปใช้ Redis (INCR + EXPIRE) แทนเพื่อแชร์ counter ข้าม
 * instance — ปัจจุบัน backend รันเป็น instance เดียว จึงยังไม่จำเป็น
 */
@Injectable()
export class UserThrottlerGuard implements CanActivate {
  private readonly limit = parseInt(process.env.USER_RATE_LIMIT_PER_MIN || '300', 10);
  private readonly windowMs = 60_000;
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as { sub?: string } | undefined;

    // ไม่มี user (เช่น endpoint สาธารณะที่หลุดมาถึงนี่ได้) — ปล่อยผ่าน ให้ global
    // ThrottlerGuard ที่ทำงานก่อนหน้าเป็นคนดูแลแทน
    if (!user?.sub) {
      return true;
    }

    const key = user.sub;
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (bucket.count >= this.limit) {
      throw new TooManyRequestsException(
        `คุณส่ง request เกินโควตา (${this.limit} ครั้ง/นาทีต่อผู้ใช้) กรุณาลองใหม่ภายหลัง`,
      );
    }

    bucket.count += 1;
    return true;
  }
}
