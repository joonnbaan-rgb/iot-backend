import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { DeviceAccessService } from '../device-access/device-access.service';

// event ภาพรวม (สถานะอุปกรณ์เปลี่ยน, rule ทำงาน) ส่งเฉพาะคนที่เกี่ยวข้องกับอุปกรณ์นั้น:
//  - ห้อง user:{id}  = ผู้ใช้แต่ละคน (เจ้าของอุปกรณ์/คนที่ถูกแชร์ให้)
//  - ห้อง admins     = admin ทุกคน
const ADMINS_ROOM = 'admins';
const userRoom = (userId: string) => `user:${userId}`;

@WebSocketGateway({
  // local dev เปิดกว้างไว้ก่อน ตอน deploy จริงควรจำกัด origin (ดู Phase 8: Hardening)
  cors: { origin: '*' },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly deviceAccess: DeviceAccessService,
  ) {}

  handleConnection(client: Socket): void {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.warn(`WebSocket client ${client.id} ไม่ได้แนบ token ตัดการเชื่อมต่อ`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      client.data.user = payload;
      client.join(userRoom(payload.sub));
      if (payload.role === 'admin') client.join(ADMINS_ROOM);
      this.logger.log(`WebSocket client ${client.id} เชื่อมต่อสำเร็จ (user: ${payload.email})`);
    } catch {
      this.logger.warn(`WebSocket client ${client.id} ใช้ token ไม่ถูกต้องหรือหมดอายุ ตัดการเชื่อมต่อ`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`WebSocket client ${client.id} ตัดการเชื่อมต่อ`);
  }

  @SubscribeMessage('subscribe:device')
  async handleSubscribeDevice(@ConnectedSocket() client: Socket, @MessageBody() deviceId: string) {
    try {
      await this.deviceAccess.assert(client.data.user, deviceId, 'view');
    } catch {
      return { event: 'error', device_id: deviceId, message: 'ไม่มีสิทธิ์ดูอุปกรณ์นี้' };
    }
    client.join(`device:${deviceId}`);
    return { event: 'subscribed', device_id: deviceId };
  }

  @SubscribeMessage('unsubscribe:device')
  handleUnsubscribeDevice(@ConnectedSocket() client: Socket, @MessageBody() deviceId: string) {
    client.leave(`device:${deviceId}`);
    return { event: 'unsubscribed', device_id: deviceId };
  }

  private extractToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token as string | undefined;
    if (authToken) return authToken;
    const queryToken = client.handshake.query?.token;
    return typeof queryToken === 'string' ? queryToken : undefined;
  }

  // ---------- เมธอดให้ service อื่นเรียกใช้ broadcast event เข้ามา ----------

  emitDeviceStatus(deviceId: string, deviceName: string, status: string): void {
    const payload = {
      device_id: deviceId,
      device_name: deviceName,
      status,
      timestamp: new Date().toISOString(),
    };
    void this.emitToDeviceAudience(deviceId, 'device:status', payload);
  }

  emitTelemetry(deviceId: string, value: number, unit: string | undefined, recordedAt: Date): void {
    this.server.to(`device:${deviceId}`).emit('telemetry', {
      device_id: deviceId,
      value,
      unit: unit ?? null,
      recorded_at: recordedAt.toISOString(),
    });
  }

  emitCommandStatus(deviceId: string, commandId: string, action: string, status: string): void {
    this.server.to(`device:${deviceId}`).emit('command:status', {
      device_id: deviceId,
      command_id: commandId,
      action,
      status,
      timestamp: new Date().toISOString(),
    });
  }

  emitRuleTriggered(ruleId: string, ruleName: string | null, deviceId: string, action: string): void {
    const payload = {
      rule_id: ruleId,
      rule_name: ruleName,
      target_device_id: deviceId,
      action,
      timestamp: new Date().toISOString(),
    };
    void this.emitToDeviceAudience(deviceId, 'rule:triggered', payload);
  }

  /** แจ้งผู้ใช้คนหนึ่ง (เช่น ให้แอปรีเฟรชรายการอุปกรณ์หลังมีการแชร์/เพิกถอน) */
  emitToUser(userId: string, event: string, payload: unknown = {}): void {
    this.server?.to(userRoom(userId)).emit(event, payload);
  }

  /**
   * ตรวจสิทธิ์ซ้ำของ socket ทุกตัวของผู้ใช้ แล้วให้ออกจากห้อง device:* ที่ไม่มีสิทธิ์ดูแล้ว
   * (เรียกหลังเพิกถอน/ลดสิทธิ์แชร์ เพื่อไม่ให้ยังได้รับ telemetry ต่อ)
   */
  async revalidateUser(userId: string): Promise<void> {
    if (!this.server) return;
    try {
      const sockets = await this.server.in(userRoom(userId)).fetchSockets();
      for (const sock of sockets) {
        for (const room of sock.rooms) {
          if (!room.startsWith('device:')) continue;
          try {
            await this.deviceAccess.assert(sock.data.user, room.slice('device:'.length), 'view');
          } catch {
            sock.leave(room);
          }
        }
      }
    } catch (err) {
      this.logger.warn(`revalidate สิทธิ์ socket ของ ${userId} ไม่สำเร็จ: ${(err as Error).message}`);
    }
  }

  /** ส่ง event ให้ admin + ผู้ใช้ที่มีสิทธิ์เห็นอุปกรณ์นั้นเท่านั้น */
  private async emitToDeviceAudience(deviceId: string, event: string, payload: unknown): Promise<void> {
    try {
      const userIds = await this.deviceAccess.audienceUserIds(deviceId);
      this.server.to([ADMINS_ROOM, ...userIds.map(userRoom)]).emit(event, payload);
    } catch (err) {
      this.logger.warn(`ส่ง event ${event} ของอุปกรณ์ ${deviceId} ไม่สำเร็จ: ${(err as Error).message}`);
    }
  }
}
