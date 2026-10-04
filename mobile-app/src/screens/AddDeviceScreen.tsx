import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { devicesApi } from '@/api/endpoints';
import { extractErrorMessage } from '@/api/client';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { colors, radius, spacing } from '@/theme';
import type { Device } from '@/types/api';
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
  submit: { marginTop: spacing.md },
});
