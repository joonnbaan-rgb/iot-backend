// Type ตรงกับ API ของ backend (ดู mobile-app/src/types/api.ts)
export type UserRole = 'admin' | 'user';
export interface Me { id: string; email: string; role: UserRole }
export interface UserRow {
  id: string; email: string; role: UserRole; created_at: string;
  status: 'active' | 'suspended';
  device_quota: number | null; site_quota: number | null;
  plan_id: string; plan_expires_at: string | null;
  last_login_at: string | null;
  device_count: number; site_count: number; shared_count: number;
}
export interface Plan {
  id: string; name: string; sort_order: number;
  device_quota: number; site_quota: number; camera_quota: number;
  recording_enabled: boolean; notification_types: string[]; retention_days: number | null;
}
export interface UserDevice { id: string; name: string; type: DeviceType; status: DeviceStatus; location: string | null; created_at: string; last_seen_at: string | null }
export interface AuthTokens { access_token: string; refresh_token: string; expires_in: string }

export type DeviceType = 'sensor' | 'camera' | 'actuator';
export type DeviceStatus = 'online' | 'offline';
export type AccessLevel = 'admin' | 'owner' | 'manager' | 'control' | 'view';

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  status: DeviceStatus;
  location: string | null;
  last_seen_at: string | null;
  rtsp_url: string | null;
  owner_id?: string | null;
  owner_email?: string | null;
  site_id?: string | null;
  mqtt_credentials_at?: string | null;
  access_level?: AccessLevel;
  created_at: string;
}

export interface SensorPoint { id?: string; device_id: string; value: number; unit: string | null; recorded_at: string }
export interface SummaryPoint { t: string; avg: number; min: number; max: number; n: number }
export interface TelemetrySummary { bucket: string; from: string; to: string; unit: string | null; points: SummaryPoint[] }
export type CommandStatus = 'pending' | 'success' | 'failed' | 'timeout';
export interface DeviceCommand { id: string; device_id: string; action: string; status: CommandStatus; created_at: string }

export type SiteKind = 'home' | 'farm' | 'factory';
export type SiteRole = 'admin' | 'operator' | 'viewer';
export interface Site { id: string; name: string; kind: SiteKind; is_personal: boolean; my_role: SiteRole; member_count: number; device_count: number }
export interface SiteMember { user_id: string; email: string; role: SiteRole; created_at: string }

export interface MqttCredentials {
  host: string; port: number; tls: boolean; username: string; password: string; client_id: string;
  publish_topics: string[]; subscribe_topics: string[];
}

export interface NotificationLog {
  id: string; channel: string; event_type: string; message: string;
  status: 'sent' | 'failed' | 'skipped'; error: string | null; created_at: string;
}

export interface Invite { id: string; email: string | null; expires_at: string; used_at: string | null; created_at: string }
export interface InviteCreated { id: string; code: string; email: string | null; expires_at: string }
export interface StreamUrls { hls_url: string; webrtc_url: string; rtsp_source: string | null; source_configured: boolean }

export const KIND_LABEL: Record<SiteKind, string> = { home: 'Smart Home', farm: 'IoT Farm', factory: 'Factory' };
export const ROLE_LABEL: Record<SiteRole, string> = { admin: 'ผู้ดูแล', operator: 'ผู้ปฏิบัติงาน', viewer: 'ผู้ชม' };
export const TYPE_LABEL: Record<DeviceType, string> = { sensor: 'เซนเซอร์', camera: 'กล้อง IP', actuator: 'อุปกรณ์สั่งงาน' };
export const EVENT_LABEL: Record<string, string> = {
  device_offline: 'อุปกรณ์ออฟไลน์', rule_triggered: 'กฎทำงาน', command_timeout: 'คำสั่งหมดเวลา', system_alert: 'แจ้งเตือนระบบ',
};

export interface NotificationChannel {
  id: string;
  type: 'telegram' | 'line' | 'email';
  label: string;
  enabled: boolean;
  /** เวลาที่ผูก (อัปเดตทุกครั้งที่ผูกซ้ำช่องเดิม) */
  linked_at?: string;
}

export interface NotificationSettingsView {
  allowed_types?: string[]; // ช่องทางที่แพ็กเกจอนุญาต
  providers: { telegram: boolean; line: boolean; email: boolean };
  account_email: string | null;
  all_events: string[];
  events: string[];
  quiet_start: number | null;
  quiet_end: number | null;
  channels: NotificationChannel[];
}

export interface LinkCode { code: string; expires_at: string; open_url: string | null; instructions: string }

export interface NotificationTestResult { channel: string; target: string; ok: boolean; error?: string }

export interface DeleteUserResult { deleted_user: string; devices_deleted: number; devices_transferred: number; sites_reassigned: number }
