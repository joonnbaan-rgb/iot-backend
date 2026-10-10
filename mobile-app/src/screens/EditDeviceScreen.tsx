import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { devicesApi } from '@/api/endpoints';
import type { MqttCredentials } from '@/types/api';
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

  const isManager = device?.access_level === 'owner' || device?.access_level === 'admin';
  const isMqttDevice = device?.type !== 'camera';

  function showCredentials(c: MqttCredentials) {
    // แสดงครั้งเดียว: ผู้ใช้ต้องบันทึกลงตัวอุปกรณ์ทันที (เซิร์ฟเวอร์เก็บเฉพาะ hash)
    Alert.alert(
      'รหัสเชื่อมต่อ MQTT (แสดงครั้งเดียว)',
      `host: ${c.host}\nport: ${c.port} (${c.tls ? 'TLS' : 'ไม่เข้ารหัส'})\nusername / clientId:\n${c.username}\npassword:\n${c.password}\n\npublish: ${c.publish_topics.join(', ')}\nsubscribe: ${c.subscribe_topics.join(', ')}`,
    );
  }

  async function issueMqtt() {
    try {
      const c = await devicesApi.issueMqtt(deviceId);
      setDevice((d) => (d ? { ...d, mqtt_credentials_at: new Date().toISOString() } : d));
      showCredentials(c);
    } catch (err) {
      Alert.alert('ออกรหัสไม่สำเร็จ', extractErrorMessage(err));
    }
  }

  function confirmIssue() {
    if (!device?.mqtt_credentials_at) return void issueMqtt();
    Alert.alert('ออกรหัสใหม่', 'รหัสเดิมจะใช้ไม่ได้ทันที ต้องตั้งค่ารหัสใหม่ในตัวอุปกรณ์', [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'ออกรหัสใหม่', style: 'destructive', onPress: issueMqtt },
    ]);
  }

  function confirmRevoke() {
    Alert.alert('เพิกถอนรหัส', 'อุปกรณ์จะเชื่อมต่อ MQTT ไม่ได้จนกว่าจะออกรหัสใหม่', [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'เพิกถอน',
        style: 'destructive',
        onPress: async () => {
          try {
            await devicesApi.revokeMqtt(deviceId);
            setDevice((d) => (d ? { ...d, mqtt_credentials_at: null } : d));
          } catch (err) {
            Alert.alert('เพิกถอนไม่สำเร็จ', extractErrorMessage(err));
          }
        },
      },
    ]);
  }

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

        {isManager && isMqttDevice && (
          <View style={styles.secBox}>
            <Text style={styles.secTitle}>รหัสเชื่อมต่อ MQTT</Text>
            <Text style={styles.secText}>
              {device.mqtt_credentials_at
                ? `ออกรหัสเมื่อ ${new Date(device.mqtt_credentials_at).toLocaleString('th-TH')}`
                : 'ยังไม่ได้ออกรหัส อุปกรณ์เชื่อมต่อ MQTT บน cloud ไม่ได้'}
            </Text>
            <Button
              title={device.mqtt_credentials_at ? 'ออกรหัสใหม่' : 'ออกรหัสเชื่อมต่อ'}
              variant="secondary"
              onPress={confirmIssue}
            />
            {!!device.mqtt_credentials_at && (
              <Button title="เพิกถอนรหัส" variant="danger" onPress={confirmRevoke} style={styles.submit} />
            )}
          </View>
        )}
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
  secBox: { marginTop: spacing.xl, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.lg },
  secTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '600', marginBottom: spacing.xs },
  secText: { color: colors.textSecondary, fontSize: 13, marginBottom: spacing.md, lineHeight: 19 },
});
