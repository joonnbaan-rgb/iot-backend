import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_BASE, tokens } from './api';

let socket: Socket | null = null;
const listeners = new Set<(s: Socket | null) => void>();

export function connectSocket(): void {
  if (socket) return;
  // auth เป็นฟังก์ชัน: ต่อใหม่ครั้งไหนก็อ่าน token ล่าสุด (หลัง refresh) เสมอ
  socket = io(API_BASE, { auth: (cb) => cb({ token: tokens.access() }), transports: ['websocket', 'polling'] });
  listeners.forEach((l) => l(socket));
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
  listeners.forEach((l) => l(null));
}

export function getSocket(): Socket | null {
  return socket;
}

/** ฟัง event ของ socket (ต่อให้ socket ถูกสร้างทีหลังก็ผูกให้อัตโนมัติ) handler เปลี่ยนทุก render ได้ ไม่ต้อง memo */
export function useSocketEvent<T>(event: string, handler: (payload: T) => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const fn = (payload: T) => ref.current(payload);
    let current: Socket | null = socket;
    const bind = (s: Socket | null) => {
      current?.off(event, fn);
      current = s;
      current?.on(event, fn);
    };
    bind(socket);
    listeners.add(bind);
    return () => {
      listeners.delete(bind);
      current?.off(event, fn);
    };
  }, [event]);
}
