import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button } from '@/components/Button';
import type { NotificationsStackParamList } from '@/navigation/types';
import { notificationsApi } from '@/api/endpoints';
import { extractErrorMessage } from '@/api/client';
import { getSocket, type RuleTriggeredEvent } from '@/realtime/socket';
import { StatusBadge } from '@/components/StatusBadge';
import { colors, radius, spacing } from '@/theme';
import type { NotificationLog } from '@/types/api';

const EVENT_LABEL_TH: Record<string, string> = {
  device_offline: 'อุปกรณ์ออฟไลน์',
  rule_triggered: 'กฎทำงาน',
  command_timeout: 'คำสั่งหมดเวลา',
};

const CHANNEL_LABEL: Record<string, string> = {
  app: 'ในแอป',
  telegram: 'Telegram',
  line: 'LINE',
  email: 'อีเมล',
  realtime: 'สด',
};

type Props = NativeStackScreenProps<NotificationsStackParamList, 'NotificationsList'>;

export function NotificationsScreen({ navigation }: Props) {
  const [items, setItems] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const data = await notificationsApi.recent(50);
      setItems(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // "rule:triggered" broadcast ให้ทุก client ในห้อง "devices" กลาง — เพิ่มเข้าลิสต์ทันทีแบบ
  // optimistic (ของจริงจะมาเป็น notification_log อีกทีตอน refresh ถ้า channel แจ้งเตือนทำงานสำเร็จ)
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleRuleTriggered = (payload: RuleTriggeredEvent) => {
      setItems((prev) => [
        {
          id: `live-${payload.timestamp}`,
          channel: 'realtime',
          event_type: 'rule_triggered',
          message: `กฎ "${payload.rule_name ?? 'ไม่มีชื่อ'}" สั่ง ${payload.action} ให้อุปกรณ์ ${payload.target_device_id}`,
          status: 'sent',
          error: null,
          created_at: payload.timestamp,
        },
        ...prev,
      ]);
    };

    socket.on('rule:triggered', handleRuleTriggered);
    return () => {
      socket.off('rule:triggered', handleRuleTriggered);
    };
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.headRow}>
        <Text style={styles.title}>การแจ้งเตือน</Text>
        <Button title="ตั้งค่า" variant="secondary" onPress={() => navigation.navigate('NotificationSettings')} />
      </View>

      {!!error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.eventType}>
                {EVENT_LABEL_TH[item.event_type] ?? item.event_type} · {CHANNEL_LABEL[item.channel] ?? item.channel}
              </Text>
              <StatusBadge status={item.status} />
            </View>
            <Text style={styles.message}>{item.message}</Text>
            <Text style={styles.time}>{new Date(item.created_at).toLocaleString('th-TH')}</Text>
          </View>
        )}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>ยังไม่มีการแจ้งเตือน</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.md },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: '700', paddingVertical: spacing.md },
  listContent: { paddingBottom: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  eventType: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  message: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: spacing.xs },
  time: { color: colors.textMuted, fontSize: 11 },
  empty: { alignItems: 'center', paddingTop: spacing.xl * 2 },
  emptyText: { color: colors.textMuted, fontSize: 14 },
  errorBox: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: colors.danger,
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  errorText: { color: colors.danger, fontSize: 13 },
});
