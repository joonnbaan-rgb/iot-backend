import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { devicesApi, discoveryApi } from '@/api/endpoints';
import { extractErrorMessage } from '@/api/client';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { colors, radius, spacing } from '@/theme';
import type { Device, DiscoveredDevice } from '@/types/api';
import type { DevicesStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<DevicesStackParamList, 'AddDevice'>;

const TYPE_OPTIONS: { value: Device['type']; label: string }[] = [
  { value: 'sensor', label: 'เซนเซอร์' },
  { value: 'camera', label: 'กล้อง IP' },
  { value: 'actuator', label: 'อุปกรณ์ไฟฟ้า' },
];

export function AddDeviceScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [type, setType] = useState<Device['type']>('sensor');
  const [location, setLocation] = useState('');
  const [rtspUrl, setRtspUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<DiscoveredDevice[] | null>(null);
  const [subnet, setSubnet] = useState('');
  const [paired, setPaired] = useState<DiscoveredDevice | null>(null);

  async function scan() {
    setScanning(true);
    setScanned(null);
    try {
      const res = await discoveryApi.scan(subnet.trim() || undefined);
      setScanned(res.devices);
    } catch (err) {
      Alert.alert('สแกนไม่สำเร็จ', extractErrorMessage(err));
    } finally {
      setScanning(false);
    }
  }

  // เลือกอุปกรณ์ที่สแกนเจอ -> เติมฟอร์มให้ ผู้ใช้ตรวจ/แก้ชื่อแล้วกดบันทึกเอง
  function pick(d: DiscoveredDevice) {
    setPaired(d);
    setName(d.name);
    setType(d.suggested_type);
    if (d.suggested_rtsp_url) setRtspUrl(d.suggested_rtsp_url);
  }

  async function handleSubmit() {
    if (!name.trim()) {
      Alert.alert('กรอกไม่ครบ', 'กรุณาตั้งชื่ออุปกรณ์');
      return;
    }
    if (type === 'camera' && rtspUrl.trim() && !/^rtsps?:\/\//.test(rtspUrl.trim())) {
      Alert.alert('รูปแบบไม่ถูกต้อง', 'rtsp_url ต้องขึ้นต้นด้วย rtsp:// หรือ rtsps://');
      return;
    }

    setLoading(true);
    try {
      await devicesApi.create({
        name: name.trim(),
        type,
        location: location.trim() || undefined,
        rtsp_url: type === 'camera' && rtspUrl.trim() ? rtspUrl.trim() : undefined,
        connection_protocol: paired ? (paired.kind === 'ip_camera' ? 'rtsp' : paired.kind) : undefined,
        connection_host: paired?.ip,
      });
      Alert.alert('สำเร็จ', 'เพิ่มอุปกรณ์เรียบร้อยแล้ว', [
        { text: 'ตกลง', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('เพิ่มอุปกรณ์ไม่สำเร็จ', extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.scanBox}>
          <Text style={styles.scanTitle}>จับคู่อุปกรณ์ในเครือข่าย</Text>
          <Text style={styles.scanHint}>
            ค้นหา Sonoff/Tasmota และกล้อง IP ในวง LAN เดียวกับเซิร์ฟเวอร์ (ปล่อยว่างเพื่อใช้วงเริ่มต้นของเซิร์ฟเวอร์)
          </Text>
          <TextField
            label="วง LAN (ไม่บังคับ)"
            value={subnet}
            onChangeText={setSubnet}
            placeholder="192.168.1.0/24"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button title={scanning ? 'กำลังสแกน…' : 'สแกนหาอุปกรณ์'} variant="secondary" onPress={scan} loading={scanning} />
          {scanned && scanned.length === 0 && (
            <Text style={styles.scanHint}>ไม่พบอุปกรณ์ที่รู้จัก (ตรวจว่าอุปกรณ์เปิดอยู่ และอยู่วง LAN เดียวกับเซิร์ฟเวอร์)</Text>
          )}
          {scanned?.map((d) => (
            <Pressable
              key={`${d.kind}-${d.ip}`}
              onPress={() => !d.already_added && pick(d)}
              style={[styles.found, paired?.ip === d.ip && paired?.kind === d.kind && styles.foundActive, d.already_added && styles.foundDone]}
            >
              <Text style={styles.foundName}>{d.name}</Text>
              <Text style={styles.foundMeta}>
                {d.ip} · {d.detail}
              </Text>
              <Text style={styles.foundAction}>
                {d.already_added ? 'เพิ่มไว้แล้ว' : paired?.ip === d.ip && paired?.kind === d.kind ? 'เลือกแล้ว ✓' : 'แตะเพื่อเลือก'}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextField label="ชื่ออุปกรณ์" value={name} onChangeText={setName} placeholder="เช่น เซนเซอร์อุณหภูมิห้องนั่งเล่น" />

        <Text style={styles.label}>ประเภทอุปกรณ์</Text>
        <View style={styles.typeRow}>
          {TYPE_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              onPress={() => setType(opt.value)}
              style={[styles.typeChip, type === opt.value && styles.typeChipActive]}
            >
              <Text style={[styles.typeChipText, type === opt.value && styles.typeChipTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextField
          label="ตำแหน่งที่ติดตั้ง (ไม่บังคับ)"
          value={location}
          onChangeText={setLocation}
          placeholder="เช่น ห้องนั่งเล่น ชั้น 1"
        />

        {type === 'camera' && (
          <TextField
            label="RTSP URL ของกล้อง (ไม่บังคับ ตั้งทีหลังได้)"
            value={rtspUrl}
            onChangeText={setRtspUrl}
            placeholder="rtsp://192.168.1.x:554/stream"
            autoCapitalize="none"
          />
        )}

        <Button title="บันทึกอุปกรณ์" onPress={handleSubmit} loading={loading} style={styles.submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg },
  label: { color: colors.textSecondary, fontSize: 13, marginBottom: spacing.sm, fontWeight: '500' },
  typeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  typeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  typeChipTextActive: { color: colors.white },
  scanBox: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  scanTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: spacing.xs },
  scanHint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginBottom: spacing.sm, marginTop: spacing.xs },
  found: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
    backgroundColor: colors.surfaceAlt,
  },
  foundActive: { borderColor: colors.primary },
  foundDone: { opacity: 0.5 },
  foundName: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  foundMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  foundAction: { color: colors.primary, fontSize: 12, marginTop: spacing.xs },
  submit: { marginTop: spacing.md },
});
