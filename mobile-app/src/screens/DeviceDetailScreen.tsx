import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { camerasApi, commandsApi, devicesApi, telemetryApi } from '@/api/endpoints';
import { extractErrorMessage } from '@/api/client';
import {
  getSocket,
  subscribeToDevice,
  unsubscribeFromDevice,
  type CommandStatusEvent,
  type TelemetryEvent,
} from '@/realtime/socket';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/Button';
import { CameraPlayer } from '@/components/CameraPlayer';
import { TextField } from '@/components/TextField';
import { StatusBadge } from '@/components/StatusBadge';
import { colors, radius, spacing } from '@/theme';
import type { CameraStreamUrls, Device, DeviceCommand, SensorDataPoint } from '@/types/api';
import type { DevicesStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<DevicesStackParamList, 'DeviceDetail'>;

const CHART_WIDTH = Dimensions.get('window').width - spacing.md * 2 - spacing.md * 2;

export function DeviceDetailScreen({ route, navigation }: Props) {
  const { deviceId } = route.params;

  const [device, setDevice] = useState<Device | null>(null);
  const [telemetry, setTelemetry] = useState<SensorDataPoint[]>([]);
  const [commands, setCommands] = useState<DeviceCommand[]>([]);
  const [streamUrls, setStreamUrls] = useState<CameraStreamUrls | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingAction, setSendingAction] = useState<string | null>(null);
  const [rtspInput, setRtspInput] = useState('rtsp://localhost:8554/webcam');
  const [savingSource, setSavingSource] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // เจ้าของอุปกรณ์หรือ admin เท่านั้นที่แก้ไข/ลบ/ตั้งค่ากล้องได้
  const { user } = useAuth();
  const canControl = device?.access_level !== 'view'; // view = ดูอย่างเดียว
  const canManage = device?.access_level === 'owner' || device?.access_level === 'admin';

  const load = useCallback(
    async (isRefresh = false) => {
      isRefresh ? setRefreshing(true) : setLoading(true);
      try {
        const d = await devicesApi.get(deviceId);
        setDevice(d);
        navigation.setOptions({ title: d.name }); // ชื่ออาจเพิ่งถูกแก้จากหน้าแก้ไข

        if (d.type === 'sensor') {
          const points = await telemetryApi.history(deviceId, { limit: 30 });
          setTelemetry(points.slice().reverse()); // backend ส่งใหม่ -> เก่า, chart อยากได้เก่า -> ใหม่
        } else if (d.type === 'actuator') {
          const history = await commandsApi.history(deviceId, 20);
          setCommands(history);
        } else if (d.type === 'camera') {
          try {
            const urls = await camerasApi.streamUrls(deviceId);
            setStreamUrls(urls);
            if (urls.rtsp_source) setRtspInput(urls.rtsp_source);
          } catch {
            setStreamUrls(null); // ยังไม่ได้ตั้งค่า rtsp source ก็ไม่เป็นไร
          }
        }
      } catch (err) {
        Alert.alert('โหลดข้อมูลไม่สำเร็จ', extractErrorMessage(err));
      } finally {
        isRefresh ? setRefreshing(false) : setLoading(false);
      }
    },
    [deviceId, navigation],
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // join ห้อง device:{id} เพื่อรับ telemetry/command:status แบบ realtime เฉพาะอุปกรณ์นี้
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    subscribeToDevice(deviceId);

    const handleTelemetry = (payload: TelemetryEvent) => {
      if (payload.device_id !== deviceId) return;
      setTelemetry((prev) => [
        ...prev.slice(-29),
        {
          id: `live-${payload.recorded_at}`,
          device_id: payload.device_id,
          value: payload.value,
          unit: payload.unit,
          recorded_at: payload.recorded_at,
        },
      ]);
    };

    const handleCommandStatus = (payload: CommandStatusEvent) => {
      if (payload.device_id !== deviceId) return;
      setCommands((prev) =>
        prev.map((c) => (c.id === payload.command_id ? { ...c, status: payload.status as DeviceCommand['status'] } : c)),
      );
    };

    socket.on('telemetry', handleTelemetry);
    socket.on('command:status', handleCommandStatus);

    return () => {
      socket.off('telemetry', handleTelemetry);
      socket.off('command:status', handleCommandStatus);
      unsubscribeFromDevice(deviceId);
    };
  }, [deviceId]);

  function confirmDelete() {
    if (!device) return;
    Alert.alert(
      'ลบอุปกรณ์',
      `ลบ "${device.name}" ถาวร?\nข้อมูล telemetry ประวัติคำสั่ง rule และคลิปของอุปกรณ์นี้จะถูกลบทั้งหมด และกู้คืนไม่ได้`,
      [
        { text: 'ยกเลิก', style: 'cancel' },
        {
          text: 'ลบ',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await devicesApi.remove(deviceId);
              navigation.goBack();
            } catch (err) {
              Alert.alert('ลบไม่สำเร็จ', extractErrorMessage(err));
              setDeleting(false);
            }
          },
        },
      ],
    );
  }

  async function saveCameraSource() {
    const url = rtspInput.trim();
    if (!/^rtsps?:\/\//.test(url)) {
      Alert.alert('รูปแบบไม่ถูกต้อง', 'RTSP URL ต้องขึ้นต้นด้วย rtsp:// หรือ rtsps://');
      return;
    }
    setSavingSource(true);
    try {
      await camerasApi.setSource(deviceId, url);
      await load(true);
      Alert.alert('สำเร็จ', 'ตั้งค่า RTSP source แล้ว');
    } catch (err) {
      Alert.alert('ตั้งค่าไม่สำเร็จ', extractErrorMessage(err));
    } finally {
      setSavingSource(false);
    }
  }

  async function sendCommand(action: string) {
    setSendingAction(action);
    try {
      const command = await commandsApi.send(deviceId, action);
      setCommands((prev) => [command, ...prev]);
    } catch (err) {
      Alert.alert('ส่งคำสั่งไม่สำเร็จ', extractErrorMessage(err));
    } finally {
      setSendingAction(null);
    }
  }

  const chartData = useMemo(() => {
    if (telemetry.length === 0) return null;
    return {
      labels: telemetry.map((_, i) => (i % Math.ceil(telemetry.length / 5 || 1) === 0 ? String(i) : '')),
      datasets: [{ data: telemetry.map((p) => p.value) }],
    };
  }, [telemetry]);

  if (loading || !device) {
    return (
      <View style={styles.centerFill}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const latestUnit = telemetry[telemetry.length - 1]?.unit ?? '';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
    >
      <View style={styles.headerRow}>
        <StatusBadge status={device.status} />
        {device.location && <Text style={styles.location}>{device.location}</Text>}
      </View>

      {device.type === 'sensor' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>ค่าล่าสุด</Text>
          {telemetry.length > 0 ? (
            <>
              <Text style={styles.bigValue}>
                {telemetry[telemetry.length - 1].value.toFixed(1)}
                <Text style={styles.unit}> {latestUnit}</Text>
              </Text>
              {chartData && (
                <LineChart
                  data={chartData}
                  width={CHART_WIDTH}
                  height={180}
                  withDots={false}
                  withInnerLines={false}
                  chartConfig={{
                    backgroundColor: colors.surface,
                    backgroundGradientFrom: colors.surface,
                    backgroundGradientTo: colors.surface,
                    decimalPlaces: 1,
                    color: () => colors.primary,
                    labelColor: () => colors.textMuted,
                    propsForBackgroundLines: { stroke: colors.border },
                  }}
                  bezier
                  style={styles.chart}
                />
              )}
            </>
          ) : (
            <Text style={styles.emptyText}>ยังไม่มีข้อมูลเซนเซอร์เข้ามา</Text>
          )}
        </View>
      )}

      {device.type === 'actuator' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>สั่งงานอุปกรณ์</Text>
          {!canControl && <Text style={styles.emptyText}>คุณมีสิทธิ์ดูอย่างเดียว สั่งงานไม่ได้</Text>}
          {canControl && <View style={styles.actionRow}>
            <Button
              title="เปิด"
              onPress={() => sendCommand('turn_on')}
              loading={sendingAction === 'turn_on'}
              disabled={!!sendingAction}
              style={styles.actionBtn}
            />
            <Button
              title="ปิด"
              onPress={() => sendCommand('turn_off')}
              loading={sendingAction === 'turn_off'}
              disabled={!!sendingAction}
              variant="danger"
              style={styles.actionBtn}
            />
          </View>}

          <Text style={[styles.cardTitle, styles.historyTitle]}>ประวัติคำสั่ง</Text>
          {commands.length === 0 && <Text style={styles.emptyText}>ยังไม่มีประวัติคำสั่ง</Text>}
          {commands.map((cmd) => (
            <View key={cmd.id} style={styles.historyRow}>
              <View>
                <Text style={styles.historyAction}>{cmd.action}</Text>
                <Text style={styles.historyTime}>{new Date(cmd.created_at).toLocaleString('th-TH')}</Text>
              </View>
              <StatusBadge status={cmd.status} />
            </View>
          ))}
        </View>
      )}

      {device.type === 'camera' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>สตรีมกล้อง</Text>
          {streamUrls?.hls_url && (streamUrls.rtsp_source || streamUrls.source_configured) ? (
            <CameraPlayer hlsUrl={streamUrls.hls_url} />
          ) : (
            <Text style={styles.emptyText}>
              {canManage ? 'ยังไม่ได้ตั้งค่า RTSP source ตั้งค่าด้านล่างเพื่อเริ่มดูสด' : 'กล้องนี้ยังไม่ได้ตั้งค่า (ให้เจ้าของอุปกรณ์ตั้งค่า)'}
            </Text>
          )}
          {canManage && (
            <View style={styles.sourceBox}>
              <TextField
                label="RTSP source"
                value={rtspInput}
                onChangeText={setRtspInput}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="rtsp://localhost:8554/webcam"
              />
              <Text style={styles.hint}>
                เว็บแคมของคอม: รันสคริปต์ webcam-stream.ps1 แล้วใช้ค่า rtsp://localhost:8554/webcam (MediaMTX รันอยู่ในเครื่องเดียวกับ backend)
              </Text>
              <Button title="บันทึกและเชื่อมต่อ" onPress={saveCameraSource} loading={savingSource} />
            </View>
          )}
        </View>
      )}

      {canManage && device.owner_id === user?.id && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>แชร์</Text>
          <Button
            title="แชร์อุปกรณ์นี้ให้บัญชีอื่น"
            variant="secondary"
            onPress={() => navigation.navigate('ShareCreate', { deviceId })}
          />
        </View>
      )}

      {canManage && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>จัดการอุปกรณ์</Text>
          <View style={styles.actionRow}>
            <Button
              title="แก้ไข"
              variant="secondary"
              onPress={() => navigation.navigate('EditDevice', { deviceId })}
              style={styles.actionBtn}
            />
            <Button title="ลบ" variant="danger" onPress={confirmDelete} loading={deleting} style={styles.actionBtn} />
          </View>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>ข้อมูลอุปกรณ์</Text>
        {!!device.owner_email && <InfoRow label="เจ้าของ" value={device.owner_email} />}
        <InfoRow label="รหัสอุปกรณ์" value={device.id} />
        <InfoRow label="สร้างเมื่อ" value={new Date(device.created_at).toLocaleString('th-TH')} />
        <InfoRow
          label="ส่งข้อมูลล่าสุด"
          value={device.last_seen_at ? new Date(device.last_seen_at).toLocaleString('th-TH') : 'ยังไม่เคย'}
        />
      </View>
    </ScrollView>
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
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  centerFill: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  location: { color: colors.textSecondary, fontSize: 13 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: spacing.sm },
  historyTitle: { marginTop: spacing.lg },
  bigValue: { color: colors.textPrimary, fontSize: 36, fontWeight: '700', marginBottom: spacing.sm },
  unit: { fontSize: 16, color: colors.textSecondary, fontWeight: '400' },
  chart: { borderRadius: radius.md, marginLeft: -spacing.md },
  emptyText: { color: colors.textMuted, fontSize: 13 },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: { flex: 1 },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  historyAction: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  historyTime: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  sourceBox: { marginTop: spacing.md },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: spacing.xs, lineHeight: 18 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  infoLabel: { color: colors.textSecondary, fontSize: 13 },
  infoValue: { color: colors.textPrimary, fontSize: 13, flexShrink: 1, marginLeft: spacing.sm },
});
