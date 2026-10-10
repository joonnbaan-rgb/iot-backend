import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { sitesApi } from '@/api/endpoints';
import { extractErrorMessage } from '@/api/client';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Segmented';
import { TextField } from '@/components/TextField';
import { useAuth } from '@/contexts/AuthContext';
import { colors, radius, spacing } from '@/theme';
import type { Site, SiteMember, SiteRole } from '@/types/api';
import type { DevicesStackParamList } from '@/navigation/types';
import { KIND_LABEL, ROLE_LABEL } from './SitesScreen';

type Props = NativeStackScreenProps<DevicesStackParamList, 'SiteDetail'>;

const ROLE_OPTIONS = (Object.keys(ROLE_LABEL) as SiteRole[]).map((r) => ({ value: r, label: ROLE_LABEL[r] }));

export function SiteDetailScreen({ route, navigation }: Props) {
  const { siteId } = route.params;
  const { user } = useAuth();
  const [site, setSite] = useState<Site | null>(null);
  const [members, setMembers] = useState<SiteMember[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<SiteRole>('viewer');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [all, ms] = await Promise.all([sitesApi.list(), sitesApi.members(siteId)]);
      const s = all.find((x) => x.id === siteId) ?? null;
      setSite(s);
      if (s) setName(s.name);
      setMembers(ms);
    } catch (err) {
      Alert.alert('โหลดไม่สำเร็จ', extractErrorMessage(err));
    }
  }, [siteId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const isAdmin = site?.my_role === 'admin';

  async function run(fn: () => Promise<unknown>, failTitle: string) {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (err) {
      Alert.alert(failTitle, extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function confirmRemove(m: SiteMember) {
    Alert.alert('นำออกจากไซต์', `นำ ${m.email} ออกจากไซต์นี้?`, [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'นำออก', style: 'destructive', onPress: () => run(() => sitesApi.removeMember(siteId, m.user_id), 'ไม่สำเร็จ') },
    ]);
  }

  function confirmDelete() {
    Alert.alert('ลบไซต์', 'ลบไซต์นี้ถาวร? (ต้องย้ายอุปกรณ์ออกก่อน)', [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ลบ',
        style: 'destructive',
        onPress: async () => {
          try {
            await sitesApi.remove(siteId);
            navigation.goBack();
          } catch (err) {
            Alert.alert('ลบไม่สำเร็จ', extractErrorMessage(err));
          }
        },
      },
    ]);
  }

  if (!site) return <View style={styles.container} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>
        {KIND_LABEL[site.kind]} · {site.device_count} อุปกรณ์
      </Text>

      {isAdmin && (
        <View style={styles.section}>
          <TextField label="ชื่อไซต์" value={name} onChangeText={setName} />
          <Button
            title="บันทึกชื่อ"
            variant="secondary"
            loading={busy}
            onPress={() => run(() => sitesApi.update(siteId, { name: name.trim() }), 'บันทึกไม่สำเร็จ')}
          />
        </View>
      )}

      <Text style={styles.heading}>สมาชิก</Text>
      {members.map((m) => (
        <View key={m.user_id} style={styles.member}>
          <Text style={styles.email}>
            {m.email}
            {m.user_id === user?.id ? ' (คุณ)' : ''}
          </Text>
          {isAdmin ? (
            <>
              <Segmented
                value={m.role}
                options={ROLE_OPTIONS}
                onChange={(r) => run(() => sitesApi.setRole(siteId, m.user_id, r), 'เปลี่ยนบทบาทไม่สำเร็จ')}
              />
              <Button title="นำออก" variant="danger" onPress={() => confirmRemove(m)} />
            </>
          ) : (
            <Text style={styles.meta}>{ROLE_LABEL[m.role]}</Text>
          )}
        </View>
      ))}

      {isAdmin && (
        <View style={styles.section}>
          <Text style={styles.heading}>เชิญสมาชิก</Text>
          <TextField
            label="อีเมล (ต้องสมัครสมาชิกแล้ว)"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Segmented value={role} onChange={setRole} options={ROLE_OPTIONS} />
          <Text style={styles.meta}>
            ผู้ดูแล = จัดการได้ทุกอย่าง · ผู้ปฏิบัติงาน = ดูและสั่งงานได้ · ผู้ชม = ดูอย่างเดียว
          </Text>
          <Button
            title="เพิ่มสมาชิก"
            loading={busy}
            onPress={() =>
              run(async () => {
                await sitesApi.addMember(siteId, { email: email.trim(), role });
                setEmail('');
              }, 'เพิ่มสมาชิกไม่สำเร็จ')
            }
            style={{ marginTop: spacing.sm }}
          />
        </View>
      )}

      {isAdmin && !site.is_personal && (
        <Button title="ลบไซต์" variant="danger" onPress={confirmDelete} style={{ marginTop: spacing.lg }} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.textSecondary, marginBottom: spacing.md },
  heading: { color: colors.textPrimary, fontSize: 16, fontWeight: '600', marginBottom: spacing.sm, marginTop: spacing.md },
  section: { marginTop: spacing.sm },
  member: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  email: { color: colors.textPrimary, fontWeight: '600', marginBottom: spacing.sm },
  meta: { color: colors.textMuted, fontSize: 13 },
});
