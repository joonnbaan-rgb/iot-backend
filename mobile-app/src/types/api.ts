// Type ที่ตรงกับ entity/DTO ฝั่ง backend (NestJS) — ดู src/*/entities ใน repo หลัก

export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: string;
}

export type DeviceType = 'sensor' | 'camera' | 'actuator';
export type DeviceStatus = 'online' | 'offline';

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  status: DeviceStatus;
  location: string | null;
  last_seen_at: string | null;
  rtsp_url: string | null;
  owner_id?: string | null;
  // ระดับสิทธิ์ของผู้ใช้ปัจจุบันต่ออุปกรณ์นี้ (backend คำนวณให้)
  access_level?: AccessLevel;
  created_at: string;
  updated_at: string;
}

export type AccessLevel = 'admin' | 'owner' | 'control' | 'view';

export interface SensorDataPoint {
  id: string;
  device_id: string;
  value: number;
  unit: string | null;
  recorded_at: string;
}

export type CommandStatus = 'pending' | 'success' | 'failed' | 'timeout';

export interface DeviceCommand {
  id: string;
  device_id: string;
  action: string;
  status: CommandStatus;
  created_at: string;
  updated_at: string;
}

export type NotificationStatus = 'sent' | 'failed' | 'skipped';

export interface NotificationLog {
  id: string;
  channel: string;
  event_type: string;
  message: string;
  status: NotificationStatus;
  error: string | null;
  created_at: string;
}

export interface CameraStreamUrls {
  hls_url?: string;
  webrtc_url?: string;
  rtsp_source?: string | null;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}
