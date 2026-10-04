import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/Button';
import { colors, radius, spacing } from '@/theme';
import { API_BASE_URL } from '@/api/client';

const ROLE_LABEL_TH: Record<string, string> = { admin: 'ผู้ดูแลระบบ', user: 'ผู้ใช้งานทั่วไป' };

export function ProfileScreen() {
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  function confirmLogout() {
    Alert.alert('ออกจากระบบ', 'ต้องการออกจากระบบใช่หรือไม่?', [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ออกจากระบบ',
        style: 'destructive',
        onPress: async () => {
          setLoggingOut(true);
          await logout();
          setLoggingOut(false);
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>บัญชีของฉัน</Text>

      <View style={styles.card}>
        <Text style={styles.avatarText}>{user?.email?.[0]?.toUpperCase() ?? '?'}</Text>
      </View>

      <View style={styles.infoCard}>
        <InfoRow label="อีเมล" value={user?.email ?? '-'} />
        <InfoRow label="สิทธิ์การใช้งาน" value={user ? ROLE_LABEL_TH[user.role] ?? user.role : '-'} />
        <InfoRow
          label="สมัครเมื่อ"
          value={user?.created_at ? new Date(user.created_at).toLocaleDateString('th-TH') : '-'}
        />
        <InfoRow label="เชื่อมต่อ backend" value={API_BASE_URL} />
      </View>

      <Button title="ออกจากระบบ" onPress={confirmLogout} loading={loggingOut} variant="danger" style={styles.logout} />
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.md },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: '700', marginBottom: spacing.lg },
  card: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  avatarText: { color: colors.white, fontSize: 28, fontWeight: '700' },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: { color: colors.textSecondary, fontSize: 13 },
  infoValue: { color: colors.textPrimary, fontSize: 13, flexShrink: 1, marginLeft: spacing.sm },
  logout: { marginTop: 'auto' },
});
