import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { devicesApi } from '@/api/endpoints';
import { extractErrorMessage } from '@/api/client';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { colors, spacing } from '@/theme';
import type { Device } from '@/types/api';
import type { DevicesStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<DevicesStackParamList, 'EditDevice'>;

const TYPE_LABEL: Record<Device['type'], string> = {
  sensor: 'เซนเซอร์',
  camera: 'กล้อง IP',
  actuator: 'อุปกรณ์ไฟฟ้า',
};

export function EditDeviceScreen({ route, navigation }: Props) {
  const { deviceId } = route.params;
  const [device, setDevice] = useState<Device | null>(null);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    devicesApi
      .get(deviceId)
      .then((d) => {
        setDevice(d);
        setName(d.name);
        setLocation(d.location ?? '');
      })
      .catch((err) => {
        Alert.alert('โหลดข้อมูลไม่สำเร็จ', extractErrorMessage(err), [{ text: 'ตกลง', onPress: () => navigation.goBack() }]);
      })
      .finally(() => setLoading(false));
  }, [deviceId, navigation]);

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('กรอกไม่ครบ', 'กรุณาตั้งชื่ออุปกรณ์');
      return;
    }
    setSaving(true);
    try {
      await devicesApi.update(deviceId, { name: name.trim(), location: location.trim() });
      navigation.goBack();
    } catch (err) {
      Alert.alert('บันทึกไม่สำเร็จ', extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading || !device) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TextField label="ชื่ออุปกรณ์" value={name} onChangeText={setName} />
        <TextField label="ตำแหน่งที่ติดตั้ง (ไม่บังคับ)" value={location} onChangeText={setLocation} />
        <Text style={styles.readonlyLabel}>ประเภทอุปกรณ์</Text>
        <Text style={styles.readonlyValue}>{TYPE_LABEL[device.type]} (เปลี่ยนไม่ได้)</Text>
        <Button title="บันทึก" onPress={handleSave} loading={saving} style={styles.submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  container: { padding: spacing.lg },
  readonlyLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '500', marginBottom: spacing.xs },
  readonlyValue: { color: colors.textMuted, fontSize: 14, marginBottom: spacing.md },
  submit: { marginTop: spacing.md },
});
