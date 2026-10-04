import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { authApi } from '@/api/endpoints';
import { tokenStorage } from '@/api/tokenStorage';
import { setOnSessionExpired, extractErrorMessage } from '@/api/client';
import { connectSocket, disconnectSocket } from '@/realtime/socket';
import type { User } from '@/types/api';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const bootstrapped = useRef(false);

  async function loadSession() {
    const accessToken = await tokenStorage.getAccessToken();
    if (!accessToken) {
      setIsLoading(false);
      return;
    }
    try {
      const me = await authApi.me();
      setUser(me);
      connectSocket(accessToken);
    } catch {
      // token หมดอายุและ interceptor refresh ก็ไม่สำเร็จ -> เคลียร์ session
      await tokenStorage.clear();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    setOnSessionExpired(() => {
      setUser(null);
      disconnectSocket();
    });

    loadSession();
  }, []);

  async function login(email: string, password: string) {
    const tokens = await authApi.login(email, password);
    await tokenStorage.setTokens(tokens.access_token, tokens.refresh_token);
    const me = await authApi.me();
    setUser(me);
    connectSocket(tokens.access_token);
  }

  async function register(email: string, password: string) {
    await authApi.register(email, password);
    // backend ไม่ auto-login หลังสมัคร -> login ต่อให้เลยเพื่อ UX ที่ลื่นไหล
    await login(email, password);
  }

  async function logout() {
    const refreshToken = await tokenStorage.getRefreshToken();
    try {
      if (refreshToken) await authApi.logout(refreshToken);
    } catch {
      // ออกจากระบบฝั่ง client ต่อได้แม้เรียก backend ไม่สำเร็จ (เช่น ไม่มีเน็ตตอนนั้น)
    }
    await tokenStorage.clear();
    disconnectSocket();
    setUser(null);
  }

  async function refreshMe() {
    const me = await authApi.me();
    setUser(me);
  }

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, isAuthenticated: !!user, login, register, logout, refreshMe }),
    [user, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth ต้องถูกเรียกภายใน <AuthProvider>');
  return ctx;
}

export { extractErrorMessage };
