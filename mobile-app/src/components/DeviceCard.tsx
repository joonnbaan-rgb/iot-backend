import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '@/theme';
import { StatusBadge } from './StatusBadge';
import type { Device } from '@/types/api';

const TYPE_LABEL_TH: Record<Device['type'], string> = {
  sensor: 'เซนเซอร์',
  camera: 'กล้อง IP',
  actuator: 'อุปกรณ์ไฟฟ้า',
};

function timeAgoTh(iso: string | null): string {
  if (!iso) return 'ไม่เคยส่งข้อมูล';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'เมื่อสักครู่';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  return `${Math.floor(hours / 24)} วันที่แล้ว`;
}

export function DeviceCard({ device, onPress }: { device: Device; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text style={styles.name}>{device.name}</Text>
          <Text style={styles.meta}>
            {TYPE_LABEL_TH[device.type]}
            {device.location ? ` · ${device.location}` : ''}
          </Text>
        </View>
        <StatusBadge status={device.status} />
      </View>
      {(device.access_level === 'view' || device.access_level === 'control') && (
        <Text style={styles.shared}>
          แชร์จาก {device.owner_email ?? 'ผู้ใช้อื่น'} · {device.access_level === 'control' ? 'ควบคุมได้' : 'ดูอย่างเดียว'}
        </Text>
      )}
      <Text style={styles.lastSeen}>อัปเดตล่าสุด: {timeAgoTh(device.last_seen_at)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  pressed: { opacity: 0.8 },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  flex: { flex: 1, marginRight: spacing.sm },
  name: { color: colors.textPrimary, fontSize: 17, fontWeight: '600', marginBottom: 2 },
  meta: { color: colors.textSecondary, fontSize: 13 },
  shared: { color: colors.primary, fontSize: 12, marginTop: spacing.xs },
  lastSeen: { color: colors.textMuted, fontSize: 12, marginTop: spacing.sm },
});
