import React, { useCallback, useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { authApi, devicesApi, groupsApi } from '@/api/endpoints';
import { extractErrorMessage } from '@/api/client';
import { getSocket, type DeviceStatusEvent } from '@/realtime/socket';
import { DeviceCard } from '@/components/DeviceCard';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Segmented';
import { colors, radius, spacing } from '@/theme';
import type { Device, DeviceGroup, Usage } from '@/types/api';
import type { DevicesStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<DevicesStackParamList, 'DevicesList'>;

export function DevicesListScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  // all | mine | shared | g:{groupId}
  const [filter, setFilter] = useState<string>('all');

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const [data, gs, us] = await Promise.all([
        devicesApi.list(),
        groupsApi.list().catch(() => []),
        authApi.usage().catch(() => null),
      ]);
      setDevices(data);
      setGroups(gs);
      setUsage(us);
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

  // ฟัง event "device:status" แบบ realtime (broadcast ให้ client ทุกตัวที่ join ห้อง "devices")
  // เพื่ออัปเดตจุดสถานะออนไลน์/ออฟไลน์ในลิสต์ทันทีโดยไม่ต้อง pull-to-refresh เอง
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleStatus = (payload: DeviceStatusEvent) => {
      setDevices((prev) =>
        prev.map((d) =>
          d.id === payload.device_id ? { ...d, status: payload.status as Device['status'] } : d,
        ),
      );
    };

    const handleSharesChanged = () => load(true);

    socket.on('device:status', handleStatus);
    socket.on('shares:changed', handleSharesChanged); // มีคนแชร์/ถอนสิทธิ์ -> โหลดรายการใหม่
    return () => {
      socket.off('device:status', handleStatus);
      socket.off('shares:changed', handleSharesChanged);
    };
  }, [load]);

  const isMine = (d: Device) => d.access_level === 'owner' || d.access_level === 'admin';
  const visible = devices.filter((d) => {
    if (filter === 'mine') return isMine(d);
    if (filter === 'shared') return !isMine(d);
    if (filter.startsWith('g:')) return groups.find((g) => g.id === filter.slice(2))?.device_ids.includes(d.id);
    return true;
  });
  const hasShared = devices.some((d) => !isMine(d));
  const filterOptions = [
    { value: 'all', label: 'ทั้งหมด' },
    ...(hasShared ? [{ value: 'mine', label: 'ของฉัน' }, { value: 'shared', label: 'แชร์ให้ฉัน' }] : []),
    ...groups.map((g) => ({ value: `g:${g.id}`, label: g.name })),
  ];

  const tools: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; go: () => void }[] = [
    { label: 'แผนผัง', icon: 'map-outline', go: () => navigation.navigate('FloorPlan') },
    { label: 'ไซต์', icon: 'business-outline', go: () => navigation.navigate('Sites') },
    { label: 'กลุ่ม', icon: 'albums-outline', go: () => navigation.navigate('Groups') },
    { label: 'การแชร์', icon: 'people-outline', go: () => navigation.navigate('Sharing') },
  ];
  const isEmpty = !loading && !error && devices.length === 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>อุปกรณ์ของคุณ</Text>
        <Text style={styles.subtitle}>
          {visible.length} เครื่อง
          {usage?.devices.limit != null ? ` · ใช้โควตา ${usage.devices.used}/${usage.devices.limit}` : ''}
        </Text>
      </View>

      {!isEmpty && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.toolbar} contentContainerStyle={styles.toolbarRow}>
          {tools.map((t) => (
            <Pressable key={t.label} onPress={t.go} style={styles.chip}>
              <Ionicons name={t.icon} size={16} color={colors.primary} />
              <Text style={styles.chipText}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {filterOptions.length > 1 && <Segmented value={filter} onChange={setFilter} options={filterOptions} />}

      {!!error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={visible}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
        renderItem={({ item }) => (
          <DeviceCard
            device={item}
            onPress={() => navigation.navigate('DeviceDetail', { deviceId: item.id, deviceName: item.name })}
          />
        )}
        ListEmptyComponent={
          isEmpty ? (
            <View style={styles.onboard}>
              <Ionicons name="hardware-chip-outline" size={48} color={colors.primary} />
              <Text style={styles.onboardTitle}>เริ่มต้นใช้งาน</Text>
              <Text style={styles.onboardText}>
                1. เพิ่มอุปกรณ์เครื่องแรกของคุณ{'\n'}2. ออกรหัสเชื่อมต่อให้เครื่องจริง{'\n'}3. ดูค่า ควบคุม ตั้งแจ้งเตือน หรือแชร์ให้คนในบ้าน/ทีม
              </Text>
              <Button title="เพิ่มอุปกรณ์เครื่องแรก" onPress={() => navigation.navigate('AddDevice')} style={styles.onboardBtn} />
              <Text style={styles.onboardHint}>ถ้ามีคนแชร์อุปกรณ์ให้คุณ จะปรากฏที่นี่อัตโนมัติ</Text>
            </View>
          ) : null
        }
      />

      {!isEmpty && (
        <Pressable style={styles.fab} onPress={() => navigation.navigate('AddDevice')} accessibilityLabel="เพิ่มอุปกรณ์">
          <Ionicons name="add" size={22} color={colors.white} />
          <Text style={styles.fabText}>เพิ่มอุปกรณ์</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.md },
  header: { paddingVertical: spacing.md },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: '700' },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  toolbar: { flexGrow: 0, marginBottom: spacing.md },
  toolbarRow: { gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.pill,
    elevation: 4,
  },
  fabText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  onboard: { alignItems: 'center', paddingTop: spacing.xl, paddingHorizontal: spacing.md },
  onboardTitle: { color: colors.textPrimary, fontSize: 20, fontWeight: '700', marginTop: spacing.md },
  onboardText: { color: colors.textSecondary, fontSize: 14, lineHeight: 24, marginVertical: spacing.md },
  onboardBtn: { alignSelf: 'stretch' },
  onboardHint: { color: colors.textMuted, fontSize: 12, marginTop: spacing.md, textAlign: 'center' },
  toolBtn: { flex: 1, paddingVertical: spacing.sm },
  addBtn: { paddingHorizontal: spacing.md },
  listContent: { paddingBottom: spacing.xl * 3, flexGrow: 1 },
  empty: { alignItems: 'center', paddingTop: spacing.xl * 2 },
  emptyText: { color: colors.textMuted, textAlign: 'center', fontSize: 14, lineHeight: 22 },
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
