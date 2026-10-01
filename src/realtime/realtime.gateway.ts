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

// ห้องกลางที่ client ทุกคน (ที่ authenticate ผ่าน) จะถูก join อัตโนมัติ
// ใช้กระจาย event ภาพรวม (สถานะอุปกรณ์เปลี่ยน, rule ทำงาน) ให้ dashboard เห็นโดยไม่ต้อง subscribe ทีละตัว
const DEVICES_ROOM = 'devices';

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
      client.join(DEVICES_ROOM);
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
  handleSubscribeDevice(@ConnectedSocket() client: Socket, @MessageBody() deviceId: string) {
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
    this.server.to(DEVICES_ROOM).emit('device:status', payload);
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
    this.server.to(DEVICES_ROOM).emit('rule:triggered', payload);
  }
}
