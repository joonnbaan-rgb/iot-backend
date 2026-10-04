import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { devicesApi } from '@/api/endpoints';
import { extractErrorMessage } from '@/api/client';
import { getSocket, type DeviceStatusEvent } from '@/realtime/socket';
import { DeviceCard } from '@/components/DeviceCard';
import { Button } from '@/components/Button';
import { useAuth } from '@/contexts/AuthContext';
import { colors, spacing } from '@/theme';
import type { Device } from '@/types/api';
import type { DevicesStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<DevicesStackParamList, 'DevicesList'>;

export function DevicesListScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const data = await devicesApi.list();
      setDevices(data);
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

    socket.on('device:status', handleStatus);
    return () => {
      socket.off('device:status', handleStatus);
    };
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>อุปกรณ์ของคุณ</Text>
          <Text style={styles.subtitle}>{devices.length} เครื่อง</Text>
        </View>
        {user?.role === 'admin' && (
          <Button title="+ เพิ่มอุปกรณ์" onPress={() => navigation.navigate('AddDevice')} style={styles.addBtn} />
        )}
      </View>

      {!!error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        data={devices}
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
                {error ? '' : 'ยังไม่มีอุปกรณ์ในระบบ\nกด "เพิ่มอุปกรณ์" เพื่อลงทะเบียนเครื่องแรก'}
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
