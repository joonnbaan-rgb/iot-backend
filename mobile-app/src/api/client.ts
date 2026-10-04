import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { tokenStorage } from './tokenStorage';
import type { AuthTokens } from '@/types/api';

// ตั้งค่าผ่าน .env (ดู .env.example) — ต้องเป็น IP ของเครื่องที่รัน backend จริง ไม่ใช่ localhost
// เพราะมือถือ/อีมูเลเตอร์ไม่ได้อยู่ network namespace เดียวกับเครื่อง dev
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// เรียกจาก AuthContext เพื่อรับรู้เมื่อ session หมดอายุจริง ๆ (refresh token ก็ใช้ไม่ได้แล้ว)
// ต้องบังคับ logout กลับไปหน้า login
let onSessionExpired: (() => void) | null = null;
export function setOnSessionExpired(handler: () => void): void {
  onSessionExpired = handler;
}

// แนบ access token ทุก request
apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await tokenStorage.getAccessToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// --- จัดการ refresh token อัตโนมัติเมื่อเจอ 401 ---
// ถ้ามีหลาย request พร้อมกันโดน 401 พร้อมกัน ต้อง refresh แค่ครั้งเดียว แล้วให้ request
// ที่เหลือรอคิวต่อ ไม่ใช่ยิง /auth/refresh ซ้ำกันหลายครั้ง (refresh token หมุนครั้งเดียวใช้ได้ครั้งเดียว)
let isRefreshing = false;
let pendingQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function resolveQueue(token: string) {
  pendingQueue.forEach((p) => p.resolve(token));
  pendingQueue = [];
}

function rejectQueue(err: unknown) {
  pendingQueue.forEach((p) => p.reject(err));
  pendingQueue = [];
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;

    const isAuthEndpoint =
      originalRequest?.url?.includes('/auth/login') || originalRequest?.url?.includes('/auth/register');

    if (error.response?.status !== 401 || !originalRequest || originalRequest._retry || isAuthEndpoint) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // มี refresh กำลังทำงานอยู่แล้ว ต่อคิวรอ token ใหม่
      return new Promise((resolve, reject) => {
        pendingQueue.push({
          resolve: (token: string) => {
            if (originalRequest.headers) originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(apiClient(originalRequest));
          },
          reject,
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = await tokenStorage.getRefreshToken();
      if (!refreshToken) {
        throw new Error('ไม่มี refresh token');
      }

      const { data } = await axios.post<AuthTokens>(`${API_BASE_URL}/auth/refresh`, {
        refresh_token: refreshToken,
      });

      await tokenStorage.setTokens(data.access_token, data.refresh_token);
      resolveQueue(data.access_token);

      if (originalRequest.headers) originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      rejectQueue(refreshError);
      await tokenStorage.clear();
      onSessionExpired?.();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

/** ดึงข้อความ error ภาษาไทยจาก backend ออกมาแสดงตรง ๆ (NestJS ValidationPipe ส่ง message เป็น array ได้) */
export function extractErrorMessage(error: unknown, fallback = 'เกิดข้อผิดพลาด กรุณาลองใหม่'): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as { message?: string | string[] } | undefined;
    if (body?.message) {
      return Array.isArray(body.message) ? body.message.join('\n') : body.message;
    }
    if (error.code === 'ECONNABORTED') return 'เชื่อมต่อ server หมดเวลา ตรวจสอบ network/IP ของ backend';
    if (error.message === 'Network Error') {
      return `เชื่อมต่อ backend ไม่ได้ (${API_BASE_URL}) ตรวจสอบว่า backend รันอยู่และ IP ถูกต้อง`;
    }
  }
  return fallback;
}
