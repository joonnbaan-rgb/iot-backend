import { apiClient } from './client';
import type {
  AuthTokens,
  CameraStreamUrls,
  Device,
  DeviceCommand,
  DeviceGroup,
  DiscoveredDevice,
  Share,
  SharePermission,
  Site,
  SiteKind,
  SiteMember,
  SiteRole,
  NotificationLog,
  SensorDataPoint,
  LinkCode,
  MqttCredentials,
  NotificationSettingsView,
  User,
} from '@/types/api';

export const authApi = {
  register: (email: string, password: string, invite_code?: string) =>
    apiClient.post<Omit<User, 'password_hash'>>('/auth/register', { email, password, invite_code: invite_code || undefined }).then((r) => r.data),

  login: (email: string, password: string) =>
    apiClient.post<AuthTokens>('/auth/login', { email, password }).then((r) => r.data),

  logout: (refreshToken: string) =>
    apiClient.post<{ message: string }>('/auth/logout', { refresh_token: refreshToken }).then((r) => r.data),

  // backend ส่งกลับ payload ของ JWT ({ sub, email, role }) ไม่มี id -> แปลง sub เป็น id ให้แอปใช้เทียบเจ้าของอุปกรณ์
  me: () =>
    apiClient
      .get<User & { sub?: string }>('/auth/me')
      .then((r) => ({ ...r.data, id: r.data.id ?? r.data.sub ?? '' })),
};

export const devicesApi = {
  list: () => apiClient.get<Device[]>('/devices').then((r) => r.data),

  get: (deviceId: string) => apiClient.get<Device>(`/devices/${deviceId}`).then((r) => r.data),

  create: (body: {
    name: string;
    type: Device['type'];
    location?: string;
    rtsp_url?: string;
    connection_protocol?: 'tasmota' | 'sonoff_diy' | 'rtsp';
    connection_host?: string;
    site_id?: string;
  }) =>
    apiClient.post<Device>('/devices', body).then((r) => r.data),

  update: (deviceId: string, body: { name?: string; location?: string }) =>
    apiClient.patch<Device>(`/devices/${deviceId}`, body).then((r) => r.data),

  remove: (deviceId: string) => apiClient.delete(`/devices/${deviceId}`).then(() => undefined),

  issueMqtt: (deviceId: string) =>
    apiClient.post<MqttCredentials>(`/devices/${deviceId}/mqtt-credentials`).then((r) => r.data),
  revokeMqtt: (deviceId: string) =>
    apiClient.delete(`/devices/${deviceId}/mqtt-credentials`).then(() => undefined),
};

export const telemetryApi = {
  history: (deviceId: string, params?: { limit?: number; from?: string; to?: string }) =>
    apiClient
      .get<SensorDataPoint[]>(`/devices/${deviceId}/telemetry`, { params })
      .then((r) => r.data),
};

export const commandsApi = {
  send: (deviceId: string, action: string) =>
    apiClient.post<DeviceCommand>(`/devices/${deviceId}/commands`, { action }).then((r) => r.data),

  history: (deviceId: string, limit?: number) =>
    apiClient
      .get<DeviceCommand[]>(`/devices/${deviceId}/commands`, { params: { limit } })
      .then((r) => r.data),
};

export const camerasApi = {
  streamUrls: (deviceId: string) =>
    apiClient.get<CameraStreamUrls>(`/devices/${deviceId}/camera/stream`).then((r) => r.data),
  // admin เท่านั้น: ตั้ง RTSP source แล้วให้ MediaMTX ลงทะเบียน path ของกล้องนี้
  setSource: (deviceId: string, rtspUrl: string) =>
    apiClient.put(`/devices/${deviceId}/camera`, { rtsp_url: rtspUrl }).then((r) => r.data),
};

export const notificationsApi = {
  recent: (limit?: number) =>
    apiClient.get<NotificationLog[]>('/notifications', { params: { limit } }).then((r) => r.data),
  settings: () => apiClient.get<NotificationSettingsView>('/notifications/settings').then((r) => r.data),
  saveSettings: (body: { events?: string[]; quiet_start?: number | null; quiet_end?: number | null }) =>
    apiClient.put<NotificationSettingsView>('/notifications/settings', body).then((r) => r.data),
  addEmail: () => apiClient.post<NotificationSettingsView>('/notifications/channels/email').then((r) => r.data),
  linkCode: (type: 'telegram' | 'line') =>
    apiClient.post<LinkCode>(`/notifications/channels/${type}/link-code`).then((r) => r.data),
  setChannel: (id: string, enabled: boolean) =>
    apiClient.patch<NotificationSettingsView>(`/notifications/channels/${id}`, { enabled }).then((r) => r.data),
  removeChannel: (id: string) => apiClient.delete(`/notifications/channels/${id}`).then(() => undefined),
  test: () =>
    apiClient
      .post<{ channel: string; target: string; ok: boolean; error?: string }[]>('/notifications/test')
      .then((r) => r.data),
};

export const groupsApi = {
  list: () => apiClient.get<DeviceGroup[]>('/groups').then((r) => r.data),
  create: (body: { name: string; device_ids?: string[] }) =>
    apiClient.post<DeviceGroup>('/groups', body).then((r) => r.data),
  update: (id: string, body: { name?: string; device_ids?: string[] }) =>
    apiClient.patch<DeviceGroup>(`/groups/${id}`, body).then((r) => r.data),
  remove: (id: string) => apiClient.delete(`/groups/${id}`).then(() => undefined),
};

export interface CreateSharePayload {
  email: string;
  permission: SharePermission;
  scope: 'all' | 'devices' | 'group';
  device_ids?: string[];
  group_id?: string;
}

export const sharesApi = {
  outgoing: () => apiClient.get<Share[]>('/shares/outgoing').then((r) => r.data),
  incoming: () => apiClient.get<Share[]>('/shares/incoming').then((r) => r.data),
  create: (body: CreateSharePayload) => apiClient.post<Share[]>('/shares', body).then((r) => r.data),
  update: (id: string, permission: SharePermission) =>
    apiClient.patch<Share>(`/shares/${id}`, { permission }).then((r) => r.data),
  revoke: (id: string) => apiClient.delete(`/shares/${id}`).then(() => undefined),
};

export const discoveryApi = {
  // สแกนหา Tasmota / Sonoff DIY / กล้อง RTSP ในวง LAN ของเซิร์ฟเวอร์ (ใช้เวลาประมาณ 5-20 วินาที)
  scan: (subnet?: string) =>
    apiClient
      .post<{ subnet: string; devices: DiscoveredDevice[] }>('/discovery/scan', subnet ? { subnet } : {}, {
        timeout: 90000,
      })
      .then((r) => r.data),
};

export const sitesApi = {
  list: () => apiClient.get<Site[]>('/sites').then((r) => r.data),
  create: (body: { name: string; kind: SiteKind }) => apiClient.post<Site>('/sites', body).then((r) => r.data),
  update: (id: string, body: { name?: string; kind?: SiteKind }) =>
    apiClient.patch<Site>(`/sites/${id}`, body).then((r) => r.data),
  remove: (id: string) => apiClient.delete(`/sites/${id}`).then(() => undefined),
  members: (id: string) => apiClient.get<SiteMember[]>(`/sites/${id}/members`).then((r) => r.data),
  addMember: (id: string, body: { email: string; role: SiteRole }) =>
    apiClient.post<SiteMember[]>(`/sites/${id}/members`, body).then((r) => r.data),
  setRole: (id: string, userId: string, role: SiteRole) =>
    apiClient.patch<SiteMember[]>(`/sites/${id}/members/${userId}`, { role }).then((r) => r.data),
  removeMember: (id: string, userId: string) =>
    apiClient.delete(`/sites/${id}/members/${userId}`).then(() => undefined),
};
