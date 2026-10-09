import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { devicesApi, groupsApi } from '@/api/endpoints';
import { extractErrorMessage } from '@/api/client';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { DevicePicker } from '@/components/DevicePicker';
import { colors, spacing } from '@/theme';
import type { Device } from '@/types/api';
import type { DevicesStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<DevicesStackParamList, 'GroupEdit'>;

export function GroupEditScreen({ route, navigation }: Props) {
  const groupId = route.params?.groupId;
  const [name, setName] = useState('');
  const [devices, setDevices] = useState<Device[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const all = await devicesApi.list();
        // ในกลุ่มใส่ได้เฉพาะอุปกรณ์ที่เราเป็นเจ้าของ
        setDevices(all.filter((d) => d.access_level === 'owner'));
        if (groupId) {
          const groups = await groupsApi.list();
          const g = groups.find((x) => x.id === groupId);
          if (g) {
            setName(g.name);
            setSelected(new Set(g.device_ids));
          }
        }
      } catch (err) {
        Alert.alert('โหลดข้อมูลไม่สำเร็จ', extractErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [groupId]);

  async function save() {
    if (!name.trim()) {
      Alert.alert('กรอกไม่ครบ', 'กรุณาตั้งชื่อกลุ่ม');
      return;
    }
    setSaving(true);
    try {
      const body = { name: name.trim(), device_ids: [...selected] };
      groupId ? await groupsApi.update(groupId, body) : await groupsApi.create(body);
      navigation.goBack();
    } catch (err) {
      Alert.alert('บันทึกไม่สำเร็จ', extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    Alert.alert('ลบกลุ่ม', 'ลบกลุ่มนี้? (อุปกรณ์ในกลุ่มไม่ถูกลบ แต่การแชร์ทั้งกลุ่มนี้จะถูกยกเลิก)', [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ลบ',
        style: 'destructive',
        onPress: async () => {
          try {
            await groupsApi.remove(groupId!);
            navigation.goBack();
          } catch (err) {
            Alert.alert('ลบไม่สำเร็จ', extractErrorMessage(err));
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <TextField label="ชื่อกลุ่ม" value={name} onChangeText={setName} placeholder="เช่น ห้องนั่งเล่น" />
      <Text style={styles.label}>อุปกรณ์ในกลุ่ม ({selected.size})</Text>
      <DevicePicker devices={devices} selected={selected} onChange={setSelected} />
      <Button title="บันทึก" onPress={save} loading={saving} style={styles.btn} />
      {!!groupId && <Button title="ลบกลุ่ม" variant="danger" onPress={confirmDelete} style={styles.btn} />}
      {!!groupId && (
        <Button
          title="แชร์กลุ่มนี้"
          variant="secondary"
          onPress={() => navigation.navigate('ShareCreate', { groupId })}
          style={styles.btn}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '500', marginBottom: spacing.sm },
  btn: { marginTop: spacing.md },
});
