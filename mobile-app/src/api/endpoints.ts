import { apiClient } from './client';
import type {
  AuthTokens,
  CameraStreamUrls,
  Device,
  DeviceCommand,
  DeviceGroup,
  Share,
  SharePermission,
  NotificationLog,
  SensorDataPoint,
  User,
} from '@/types/api';

export const authApi = {
  register: (email: string, password: string) =>
    apiClient.post<Omit<User, 'password_hash'>>('/auth/register', { email, password }).then((r) => r.data),

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

  create: (body: { name: string; type: Device['type']; location?: string; rtsp_url?: string }) =>
    apiClient.post<Device>('/devices', body).then((r) => r.data),

  update: (deviceId: string, body: { name?: string; location?: string }) =>
    apiClient.patch<Device>(`/devices/${deviceId}`, body).then((r) => r.data),

  remove: (deviceId: string) => apiClient.delete(`/devices/${deviceId}`).then(() => undefined),
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
