import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { devicesApi, groupsApi } from '@/api/endpoints';
import { extractErrorMessage } from '@/api/client';
import { getSocket, type DeviceStatusEvent } from '@/realtime/socket';
import { DeviceCard } from '@/components/DeviceCard';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Segmented';
import { colors, spacing } from '@/theme';
import type { Device, DeviceGroup } from '@/types/api';
import type { DevicesStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<DevicesStackParamList, 'DevicesList'>;

export function DevicesListScreen({ navigation }: Props) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  // all | mine | shared | g:{groupId}
  const [filter, setFilter] = useState<string>('all');

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const [data, gs] = await Promise.all([devicesApi.list(), groupsApi.list().catch(() => [])]);
      setDevices(data);
      setGroups(gs);
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>อุปกรณ์ของคุณ</Text>
          <Text style={styles.subtitle}>{visible.length} เครื่อง</Text>
        </View>
        <Button title="+ เพิ่มอุปกรณ์" onPress={() => navigation.navigate('AddDevice')} style={styles.addBtn} />
      </View>

      <View style={styles.toolbar}>
        <Button title="ไซต์" variant="secondary" onPress={() => navigation.navigate('Sites')} style={styles.toolBtn} />
        <Button title="กลุ่ม" variant="secondary" onPress={() => navigation.navigate('Groups')} style={styles.toolBtn} />
        <Button title="การแชร์" variant="secondary" onPress={() => navigation.navigate('Sharing')} style={styles.toolBtn} />
      </View>

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
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {error ? '' : 'คุณยังไม่มีอุปกรณ์\nกด "เพิ่มอุปกรณ์" เพื่อลงทะเบียนเครื่องแรก'}
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.md },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: '700' },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  toolbar: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  toolBtn: { flex: 1, paddingVertical: spacing.sm },
  addBtn: { paddingHorizontal: spacing.md },
  listContent: { paddingBottom: spacing.xl },
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
