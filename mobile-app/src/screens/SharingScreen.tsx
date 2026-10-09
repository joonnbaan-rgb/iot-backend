import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { sharesApi } from '@/api/endpoints';
import { extractErrorMessage } from '@/api/client';
import { getSocket } from '@/realtime/socket';
import { Button } from '@/components/Button';
import { colors, radius, spacing } from '@/theme';
import type { Share } from '@/types/api';
import type { DevicesStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<DevicesStackParamList, 'Sharing'>;

const PERM: Record<Share['permission'], string> = { view: 'ดูอย่างเดียว', control: 'ควบคุมได้' };

function scopeText(s: Share): string {
  if (s.scope === 'all') return 'ทุกอุปกรณ์';
  if (s.scope === 'group') return `กลุ่ม: ${s.group_name ?? '-'}`;
  return `อุปกรณ์: ${s.device_name ?? '-'}`;
}

export function SharingScreen({ navigation }: Props) {
  const [outgoing, setOutgoing] = useState<Share[]>([]);
  const [incoming, setIncoming] = useState<Share[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [o, i] = await Promise.all([sharesApi.outgoing(), sharesApi.incoming()]);
      setOutgoing(o);
      setIncoming(i);
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

  async function togglePermission(s: Share) {
    try {
      await sharesApi.update(s.id, s.permission === 'view' ? 'control' : 'view');
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
              title={s.permission === 'view' ? 'ให้ควบคุมได้' : 'ลดเป็นดูอย่างเดียว'}
              variant="secondary"
              onPress={() => togglePermission(s)}
              style={styles.btnFlex}
            />
            <Button title="ยกเลิก" variant="danger" onPress={() => revoke(s, false)} style={styles.btnFlex} />
          </View>
        </View>
      ))}

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
