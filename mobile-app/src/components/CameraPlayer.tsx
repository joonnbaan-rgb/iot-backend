import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ResizeMode, Video } from 'expo-av';
import { API_BASE_URL } from '@/api/client';
import { Button } from '@/components/Button';
import { colors, radius, spacing } from '@/theme';

const MAX_AUTO_RETRIES = 6;
const RETRY_DELAY_MS = 3000;

/**
 * backend ส่ง URL ที่อิง MEDIAMTX_PUBLIC_HLS_URL (อาจเป็น localhost) กลับมา
 * มือถือเปิด localhost ไม่ได้ จึงแทนที่ host ด้วย host เดียวกับที่แอปใช้เรียก backend
 * (หมายเหตุ: ไม่ใช้ URL().hostname เพราะ React Native ยังไม่รองรับการ set ค่านี้)
 */
export function toReachableUrl(url: string): string {
  const apiHost = API_BASE_URL.match(/^https?:\/\/([^/:]+)/)?.[1];
  if (!apiHost) return url;
  // เปลี่ยน host เฉพาะ URL ที่ชี้ localhost / IP ในวง LAN (โหมดทดสอบในบ้าน)
  // ถ้าเป็นโดเมนจริงบน cloud (https://stream.example.com) ใช้ตามที่ backend ส่งมาเลย
  const host = url.match(/^https?:\/\/([^/:]+)/)?.[1] ?? '';
  const isLocal = host === 'localhost' || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
  if (!isLocal) return url;
  return url.replace(/^(https?:\/\/)[^/:]+/, `$1${apiHost}`);
}

interface Props {
  hlsUrl: string;
}

export function CameraPlayer({ hlsUrl }: Props) {
  const uri = toReachableUrl(hlsUrl);
  const [attempt, setAttempt] = useState(0); // เปลี่ยนค่าเพื่อบังคับสร้าง player ใหม่
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const retries = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const restart = useCallback(() => {
    retries.current = 0;
    setFailed(false);
    setLoading(true);
    setAttempt((n) => n + 1);
  }, []);

  // MediaMTX ใช้ sourceOnDemand: ครั้งแรกที่เปิดดูต้องรอให้ดึงสตรีมจากกล้องสักครู่ จึงลองใหม่อัตโนมัติ
  const handleError = useCallback(() => {
    if (retries.current >= MAX_AUTO_RETRIES) {
      setLoading(false);
      setFailed(true);
      return;
    }
    retries.current += 1;
    timer.current = setTimeout(() => setAttempt((n) => n + 1), RETRY_DELAY_MS);
  }, []);

  return (
    <View>
      <View style={styles.frame}>
        <Video
          key={attempt}
          style={styles.video}
          source={{ uri }}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay
          useNativeControls
          onLoad={() => {
            retries.current = 0;
            setLoading(false);
          }}
          onError={handleError}
        />
        {loading && !failed && (
          <View style={styles.overlay} pointerEvents="none">
            <ActivityIndicator color={colors.textPrimary} />
            <Text style={styles.overlayText}>
              {retries.current > 0 ? `กำลังรอสตรีมจากกล้อง... (${retries.current}/${MAX_AUTO_RETRIES})` : 'กำลังเชื่อมต่อ...'}
            </Text>
          </View>
        )}
      </View>
      {failed && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>
            เปิดสตรีมไม่ได้ ตรวจว่าสคริปต์ webcam-stream.ps1 กำลังรันอยู่ และ MediaMTX เปิดพอร์ต 8888
          </Text>
          <Button title="ลองใหม่" onPress={restart} variant="secondary" />
        </View>
      )}
      <Text style={styles.urlText} numberOfLines={1}>
        {uri}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  video: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  overlayText: { color: colors.textPrimary, fontSize: 13 },
  errorBox: { marginTop: spacing.sm, gap: spacing.sm },
  errorText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  urlText: { color: colors.textMuted, fontSize: 11, marginTop: spacing.xs },
});
