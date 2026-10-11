import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { sharesApi } from '@/api/endpoints';
import { extractErrorMessage } from '@/api/client';
import { getSocket } from '@/realtime/socket';
import { Button } from '@/components/Button';
import { colors, radius, spacing } from '@/theme';
import type { PendingShare, Share, SharePermission } from '@/types/api';
import type { DevicesStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<DevicesStackParamList, 'Sharing'>;

const PERM: Record<SharePermission, string> = { view: 'ดูอย่างเดียว', control: 'ควบคุมได้', manage: 'ผู้จัดการร่วม' };

function scopeText(s: { scope: Share['scope']; group_name: string | null; device_name: string | null }): string {
  if (s.scope === 'all') return 'ทุกอุปกรณ์';
  if (s.scope === 'group') return `กลุ่ม: ${s.group_name ?? '-'}`;
  return `อุปกรณ์: ${s.device_name ?? '-'}`;
}

export function SharingScreen({ navigation }: Props) {
  const [outgoing, setOutgoing] = useState<Share[]>([]);
  const [incoming, setIncoming] = useState<Share[]>([]);
  const [pending, setPending] = useState<PendingShare[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [o, i, p] = await Promise.all([sharesApi.outgoing(), sharesApi.incoming(), sharesApi.pending()]);
      setOutgoing(o);
      setIncoming(i);
      setPending(p);
    } catch (err) {
      Alert.alert('โหลดไม่สำเร็จ', extractErrorMessage(err));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    const socket = getSocket();
    socket?.on('shares:changed', load);
    return () => {
      socket?.off('shares:changed', load);
    };
  }, [load]);

  function revoke(s: Share, incomingSide: boolean) {
    Alert.alert(
      incomingSide ? 'ออกจากการแชร์' : 'ยกเลิกการแชร์',
      incomingSide
        ? `เลิกรับการแชร์ (${scopeText(s)}) จาก ${s.counterpart_email}?`
        : `ยกเลิกการแชร์ (${scopeText(s)}) ให้ ${s.counterpart_email}?`,
      [
        { text: 'ไม่', style: 'cancel' },
        {
          text: 'ยืนยัน',
          style: 'destructive',
          onPress: async () => {
            try {
              await sharesApi.revoke(s.id);
              await load();
            } catch (err) {
              Alert.alert('ไม่สำเร็จ', extractErrorMessage(err));
            }
          },
        },
      ],
    );
  }

  function changePermission(s: Share) {
    const opts: SharePermission[] = ['view', 'control', 'manage'];
    Alert.alert(
      'เปลี่ยนสิทธิ์',
      `${s.counterpart_email} (ปัจจุบัน: ${PERM[s.permission]})`,
      [
        ...opts
          .filter((p) => p !== s.permission)
          .map((p) => ({
            text: PERM[p],
            onPress: async () => {
              try {
                await sharesApi.update(s.id, p);
                await load();
              } catch (err) {
                Alert.alert('ไม่สำเร็จ', extractErrorMessage(err));
              }
            },
          })),
        { text: 'ยกเลิก', style: 'cancel' as const },
      ],
    );
  }

  async function cancelPending(p: PendingShare) {
    try {
      await sharesApi.revokePending(p.id);
      await load();
    } catch (err) {
      Alert.alert('ไม่สำเร็จ', extractErrorMessage(err));
    }
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.primary} />}
    >
      <Button title="+ แชร์อุปกรณ์ให้บัญชีอื่น" onPress={() => navigation.navigate('ShareCreate')} />

      <Text style={styles.section}>ที่ฉันแชร์ให้คนอื่น</Text>
      {outgoing.length === 0 && <Text style={styles.empty}>ยังไม่ได้แชร์ให้ใคร</Text>}
      {outgoing.map((s) => (
        <View key={s.id} style={styles.card}>
          <Text style={styles.title}>{s.counterpart_email}</Text>
          <Text style={styles.meta}>
            {scopeText(s)} · {PERM[s.permission]}
          </Text>
          <View style={styles.row}>
            <Button
              title="เปลี่ยนสิทธิ์"
              variant="secondary"
              onPress={() => changePermission(s)}
              style={styles.btnFlex}
            />
            <Button title="ยกเลิก" variant="danger" onPress={() => revoke(s, false)} style={styles.btnFlex} />
          </View>
        </View>
      ))}

      {pending.length > 0 && (
        <>
          <Text style={styles.section}>คำเชิญที่รอรับ (ยังไม่ได้สมัคร)</Text>
          {pending.map((p) => (
            <View key={p.id} style={styles.card}>
              <Text style={styles.title}>{p.email}</Text>
              <Text style={styles.meta}>
                {scopeText(p)} · {PERM[p.permission]}
              </Text>
              <Button title="ยกเลิกคำเชิญ" variant="secondary" onPress={() => cancelPending(p)} />
            </View>
          ))}
        </>
      )}

      <Text style={styles.section}>ที่คนอื่นแชร์ให้ฉัน</Text>
      {incoming.length === 0 && <Text style={styles.empty}>ยังไม่มีใครแชร์ให้</Text>}
      {incoming.map((s) => (
        <View key={s.id} style={styles.card}>
          <Text style={styles.title}>จาก {s.counterpart_email}</Text>
          <Text style={styles.meta}>
            {scopeText(s)} · {PERM[s.permission]}
          </Text>
          <Button title="ออกจากการแชร์" variant="secondary" onPress={() => revoke(s, true)} style={styles.leave} />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.md, paddingBottom: spacing.xl * 2 },
  section: { color: colors.textPrimary, fontSize: 16, fontWeight: '700', marginTop: spacing.lg, marginBottom: spacing.sm },
  empty: { color: colors.textMuted, fontSize: 13 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  title: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  meta: { color: colors.textSecondary, fontSize: 13, marginTop: 2, marginBottom: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  btnFlex: { flex: 1 },
  leave: { marginTop: spacing.xs },
});
