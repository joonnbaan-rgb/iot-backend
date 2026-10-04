import { io, Socket } from 'socket.io-client';

// ตรงกับ RealtimeGateway ฝั่ง backend (src/realtime/realtime.gateway.ts):
// - auth ผ่าน handshake.auth.token (JWT access token เดิมที่ใช้กับ REST)
// - client ทุกตัวถูก join ห้อง "devices" กลางอัตโนมัติ (ได้ device:status, rule:triggered)
// - ต้อง emit "subscribe:device" ด้วย deviceId ถึงจะได้ event "telemetry" / "command:status"
//   ของอุปกรณ์ตัวนั้น

const WS_URL = process.env.EXPO_PUBLIC_WS_URL ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export interface DeviceStatusEvent {
  device_id: string;
  device_name: string;
  status: string;
  timestamp: string;
}

export interface TelemetryEvent {
  device_id: string;
  value: number;
  unit: string | null;
  recorded_at: string;
}

export interface CommandStatusEvent {
  device_id: string;
  command_id: string;
  action: string;
  status: string;
  timestamp: string;
}

export interface RuleTriggeredEvent {
  rule_id: string;
  rule_name: string | null;
  target_device_id: string;
  action: string;
  timestamp: string;
}

let socket: Socket | null = null;

/** เปิดการเชื่อมต่อ WebSocket ด้วย access token ปัจจุบัน (เรียกหลัง login สำเร็จ) */
export function connectSocket(accessToken: string): Socket {
  if (socket) {
    socket.disconnect();
  }
  socket = io(WS_URL, {
    auth: { token: accessToken },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1500,
  });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}

export function subscribeToDevice(deviceId: string): void {
  socket?.emit('subscribe:device', deviceId);
}

export function unsubscribeFromDevice(deviceId: string): void {
  socket?.emit('unsubscribe:device', deviceId);
}
