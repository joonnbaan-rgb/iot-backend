import { apiClient } from './client';
import type {
  AuthTokens,
  CameraStreamUrls,
  Device,
  DeviceCommand,
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

  me: () => apiClient.get<User>('/auth/me').then((r) => r.data),
};

export const devicesApi = {
  list: () => apiClient.get<Device[]>('/devices').then((r) => r.data),

  get: (deviceId: string) => apiClient.get<Device>(`/devices/${deviceId}`).then((r) => r.data),

  create: (body: { name: string; type: Device['type']; location?: string; rtsp_url?: string }) =>
    apiClient.post<Device>('/devices', body).then((r) => r.data),
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
