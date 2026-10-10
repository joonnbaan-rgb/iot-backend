import type {
  AuthTokens, Device, DeviceCommand, DeviceType, Invite, InviteCreated, Me, MqttCredentials, NotificationLog,
  SensorPoint, Site, SiteKind, SiteMember, SiteRole, StreamUrls, UserRole, UserRow,
} from './types';

export const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

const ACCESS = 'iot_access';
const REFRESH = 'iot_refresh';

export const tokens = {
  access: () => localStorage.getItem(ACCESS),
  refresh: () => localStorage.getItem(REFRESH),
  set(t: { access_token: string; refresh_token: string }) {
    localStorage.setItem(ACCESS, t.access_token);
    localStorage.setItem(REFRESH, t.refresh_token);
  },
  clear() {
    localStorage.removeItem(ACCESS);
    localStorage.removeItem(REFRESH);
  },
};

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let message = `เกิดข้อผิดพลาด (${res.status})`;
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (body.message) message = Array.isArray(body.message) ? body.message.join('\n') : body.message;
  } catch {
    /* ไม่ใช่ JSON */
  }
  return new ApiError(message, res.status);
}

let refreshing: Promise<boolean> | null = null;

/** ต่ออายุ token (single-flight: หลายคำขอที่โดน 401 พร้อมกันใช้ผลเดียวกัน) */
function refreshTokens(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      const rt = tokens.refresh();
      if (!rt) return false;
      try {
        const res = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: rt }),
        });
        if (!res.ok) return false;
        tokens.set((await res.json()) as AuthTokens);
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

async function request<T>(method: string, path: string, body?: unknown, retry = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const at = tokens.access();
  if (at) headers.Authorization = `Bearer ${at}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError('เชื่อมต่อ server ไม่ได้ ตรวจสอบ URL ของ backend', 0);
  }

  const isAuthCall = path.startsWith('/auth/login') || path.startsWith('/auth/register');
  if (res.status === 401 && retry && !isAuthCall) {
    if (await refreshTokens()) return request<T>(method, path, body, false);
    tokens.clear();
    window.dispatchEvent(new Event('session-expired'));
  }
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const get = <T>(p: string) => request<T>('GET', p);
const post = <T>(p: string, b?: unknown) => request<T>('POST', p, b ?? {});
const patch = <T>(p: string, b: unknown) => request<T>('PATCH', p, b);
const del = (p: string) => request<void>('DELETE', p);

export const api = {
  login: (email: string, password: string) => post<AuthTokens>('/auth/login', { email, password }),
  logout: (refresh_token: string) => post<unknown>('/auth/logout', { refresh_token }),
  me: async (): Promise<Me> => {
    const m = await get<{ sub: string; email: string; role: UserRole }>('/auth/me');
    return { id: m.sub, email: m.email, role: m.role };
  },

  devices: () => get<Device[]>('/devices'),
  device: (id: string) => get<Device>(`/devices/${id}`),
  createDevice: (b: { name: string; type: DeviceType; location?: string; rtsp_url?: string; site_id?: string }) =>
    post<Device>('/devices', b),
  updateDevice: (id: string, b: { name?: string; location?: string; site_id?: string }) => patch<Device>(`/devices/${id}`, b),
  deleteDevice: (id: string) => del(`/devices/${id}`),
  telemetry: (id: string, q: { limit?: number; from?: string }) => {
    const p = new URLSearchParams();
    if (q.limit) p.set('limit', String(q.limit));
    if (q.from) p.set('from', q.from);
    return get<SensorPoint[]>(`/devices/${id}/telemetry?${p.toString()}`);
  },
  commands: (id: string) => get<DeviceCommand[]>(`/devices/${id}/commands?limit=20`),
  sendCommand: (id: string, action: string) => post<DeviceCommand>(`/devices/${id}/commands`, { action }),
  issueMqtt: (id: string) => post<MqttCredentials>(`/devices/${id}/mqtt-credentials`),
  revokeMqtt: (id: string) => del(`/devices/${id}/mqtt-credentials`),
  stream: (id: string) => get<StreamUrls>(`/devices/${id}/camera/stream`),

  sites: () => get<Site[]>('/sites'),
  createSite: (b: { name: string; kind: SiteKind }) => post<Site>('/sites', b),
  updateSite: (id: string, b: { name?: string; kind?: SiteKind }) => patch<Site>(`/sites/${id}`, b),
  deleteSite: (id: string) => del(`/sites/${id}`),
  members: (id: string) => get<SiteMember[]>(`/sites/${id}/members`),
  addMember: (id: string, b: { email: string; role: SiteRole }) => post<SiteMember[]>(`/sites/${id}/members`, b),
  setMemberRole: (id: string, uid: string, role: SiteRole) => patch<SiteMember[]>(`/sites/${id}/members/${uid}`, { role }),
  removeMember: (id: string, uid: string) => del(`/sites/${id}/members/${uid}`),

  notifications: (limit = 100) => get<NotificationLog[]>(`/notifications?limit=${limit}`),

  users: () => get<UserRow[]>('/users'),
  setUserRole: (id: string, role: UserRole) => patch<UserRow>(`/users/${id}/role`, { role }),
  invites: () => get<Invite[]>('/invites'),
  createInvite: (b: { email?: string; days?: number }) => post<InviteCreated>('/invites', b),
  deleteInvite: (id: string) => del(`/invites/${id}`),
};
