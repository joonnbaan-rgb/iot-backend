import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, tokens } from './api';
import { connectSocket, disconnectSocket } from './socket';
import type { Me } from './types';

interface AuthState {
  user: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (tokens.access()) {
        try {
          const me = await api.me();
          if (alive) {
            setUser(me);
            connectSocket();
          }
        } catch {
          tokens.clear();
        }
      }
      if (alive) setLoading(false);
    })();
    const expired = () => {
      setUser(null);
      disconnectSocket();
    };
    window.addEventListener('session-expired', expired);
    return () => {
      alive = false;
      window.removeEventListener('session-expired', expired);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    tokens.set(await api.login(email, password));
    setUser(await api.me());
    connectSocket();
  }, []);

  const logout = useCallback(async () => {
    const rt = tokens.refresh();
    try {
      if (rt) await api.logout(rt);
    } catch {
      /* ออกจากระบบฝั่งนี้ต่อได้แม้ server ไม่ตอบ */
    }
    tokens.clear();
    disconnectSocket();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth ต้องอยู่ใน AuthProvider');
  return v;
}
