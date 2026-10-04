import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '@/theme';

type Tone = 'online' | 'offline' | 'success' | 'failed' | 'pending' | 'timeout' | 'neutral';

const TONE_COLOR: Record<Tone, string> = {
  online: colors.success,
  success: colors.success,
  offline: colors.textMuted,
  neutral: colors.textMuted,
  failed: colors.danger,
  timeout: colors.danger,
  pending: colors.warning,
};

const TONE_LABEL_TH: Record<string, string> = {
  online: 'ออนไลน์',
  offline: 'ออฟไลน์',
  success: 'สำเร็จ',
  failed: 'ล้มเหลว',
  pending: 'กำลังทำ',
  timeout: 'หมดเวลา',
  sent: 'ส่งแล้ว',
  skipped: 'ข้าม',
};

export function StatusBadge({ status }: { status: string }) {
  const tone = (TONE_COLOR[status as Tone] ? status : 'neutral') as Tone;
  const color = TONE_COLOR[tone] ?? colors.textMuted;
  const label = TONE_LABEL_TH[status] ?? status;

  return (
    <View style={[styles.badge, { backgroundColor: `${color}26`, borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    gap: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 12, fontWeight: '600' },
});
