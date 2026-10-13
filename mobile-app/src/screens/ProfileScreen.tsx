import React, { useCallback, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { authApi } from '@/api/endpoints';
import { extractErrorMessage } from '@/api/client';
import type { Usage } from '@/types/api';
import { colors, radius, spacing } from '@/theme';
import { API_BASE_URL } from '@/api/client';

const ROLE_LABEL_TH: Record<string, string> = { admin: 'ผู้ดูแลระบบ', user: 'ผู้ใช้งานทั่วไป' };

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  useFocusEffect(
    useCallback(() => {
      authApi.usage().then(setUsage).catch(() => undefined);
    }, []),
  );

  async function changePassword() {
    if (newPw.length < 8) {
      Alert.alert('รหัสผ่านสั้นไป', 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร');
      return;
    }
    setSavingPw(true);
    try {
      await authApi.changePassword(curPw, newPw);
      Alert.alert('สำเร็จ', 'เปลี่ยนรหัสผ่านแล้ว (อุปกรณ์อื่นที่ล็อกอินอยู่จะต้องเข้าสู่ระบบใหม่)');
      setCurPw('');
      setNewPw('');
      setShowPw(false);
    } catch (err) {
      Alert.alert('ไม่สำเร็จ', extractErrorMessage(err));
    } finally {
      setSavingPw(false);
    }
  }

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
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView style={styles.flex} contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.md }]} keyboardShouldPersistTaps="handled">
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

      {usage?.plan && (
        <View style={styles.infoCard}>
          <InfoRow label="แพ็กเกจ" value={usage.plan.expired ? `${usage.plan.name} (หมดอายุ ใช้สิทธิ์ Free)` : usage.plan.name} />
          <InfoRow
            label="หมดอายุ"
            value={
              usage.plan.expires_at
                ? `${new Date(usage.plan.expires_at).toLocaleDateString('th-TH')}${
                    usage.plan.expired ? '' : usage.plan.days_left != null ? ` (อีก ${usage.plan.days_left} วัน)` : ''
                  }`
                : 'ไม่หมดอายุ'
            }
          />
          {usage.features && (
            <>
              <InfoRow label="บันทึกคลิปกล้อง" value={usage.features.recording_enabled ? 'ได้' : 'ไม่รวมในแพ็กเกจ'} />
              <InfoRow label="เก็บข้อมูลเซนเซอร์" value={usage.features.retention_days == null ? 'ไม่จำกัด' : `${usage.features.retention_days} วัน`} />
              <InfoRow
                label="ช่องทางแจ้งเตือน"
                value={usage.features.notification_types.map((t) => (t === 'telegram' ? 'Telegram' : t === 'line' ? 'LINE' : 'อีเมล')).join(', ') || '-'}
              />
            </>
          )}
        </View>
      )}

      {usage && (
        <View style={styles.infoCard}>
          <InfoRow label="อุปกรณ์ที่เป็นเจ้าของ" value={usage.devices.limit == null ? `${usage.devices.used} (ไม่จำกัด)` : `${usage.devices.used} / ${usage.devices.limit}`} />
          <InfoRow label="ไซต์ที่สร้างเพิ่ม" value={usage.sites.limit == null ? `${usage.sites.used} (ไม่จำกัด)` : `${usage.sites.used} / ${usage.sites.limit}`} />
          {usage.cameras && (
            <InfoRow label="กล้อง" value={usage.cameras.limit == null ? `${usage.cameras.used} (ไม่จำกัด)` : `${usage.cameras.used} / ${usage.cameras.limit}`} />
          )}
          <Text style={styles.quotaHint}>ต้องการโควตาเพิ่มหรืออัปเกรดแพ็กเกจ? ติดต่อผู้ดูแลระบบ</Text>
        </View>
      )}

      {showPw ? (
        <View style={styles.infoCard}>
          <TextField label="รหัสผ่านปัจจุบัน" value={curPw} onChangeText={setCurPw} secureTextEntry autoCapitalize="none" />
          <TextField label="รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)" value={newPw} onChangeText={setNewPw} secureTextEntry autoCapitalize="none" />
          <Button title="บันทึกรหัสผ่านใหม่" onPress={changePassword} loading={savingPw} />
          <Button title="ยกเลิก" variant="secondary" onPress={() => setShowPw(false)} style={styles.gap} />
        </View>
      ) : (
        <Button title="เปลี่ยนรหัสผ่าน" variant="secondary" onPress={() => setShowPw(true)} />
      )}

      <Button title="ออกจากระบบ" onPress={confirmLogout} loading={loggingOut} variant="danger" style={styles.logout} />
    </ScrollView>
    </KeyboardAvoidingView>
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
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.md, paddingBottom: spacing.xl * 2 },
  quotaHint: { color: colors.textMuted, fontSize: 12, marginTop: spacing.sm },
  gap: { marginTop: spacing.sm },
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
  logout: { marginTop: spacing.xl },
});
