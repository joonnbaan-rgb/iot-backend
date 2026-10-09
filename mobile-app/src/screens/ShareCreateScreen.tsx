import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { devicesApi, groupsApi, sharesApi } from '@/api/endpoints';
import { extractErrorMessage } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { DevicePicker } from '@/components/DevicePicker';
import { Segmented } from '@/components/Segmented';
import { colors, spacing } from '@/theme';
import type { Device, DeviceGroup, SharePermission } from '@/types/api';
import type { DevicesStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<DevicesStackParamList, 'ShareCreate'>;
type Scope = 'all' | 'devices' | 'group';

export function ShareCreateScreen({ route, navigation }: Props) {
  const presetDevice = route.params?.deviceId;
  const presetGroup = route.params?.groupId;

  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState<SharePermission>('view');
  const [scope, setScope] = useState<Scope>(presetGroup ? 'group' : presetDevice ? 'devices' : 'all');
  const [devices, setDevices] = useState<Device[]>([]);
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(presetDevice ? [presetDevice] : []));
  const [groupId, setGroupId] = useState<string | undefined>(presetGroup);
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [all, gs] = await Promise.all([devicesApi.list(), groupsApi.list()]);
        setDevices(all.filter((d) => d.owner_id === user?.id));
        setGroups(gs);
      } catch (err) {
        Alert.alert('โหลดข้อมูลไม่สำเร็จ', extractErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  async function submit() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      Alert.alert('อีเมลไม่ถูกต้อง', 'กรุณากรอกอีเมลของบัญชีที่ต้องการแชร์ให้');
      return;
    }
    if (scope === 'devices' && selected.size === 0) {
      Alert.alert('ยังไม่ได้เลือก', 'เลือกอุปกรณ์อย่างน้อย 1 รายการ');
      return;
    }
    if (scope === 'group' && !groupId) {
      Alert.alert('ยังไม่ได้เลือก', 'เลือกกลุ่มที่ต้องการแชร์');
      return;
    }
    setSaving(true);
    try {
      await sharesApi.create({
        email: email.trim(),
        permission,
        scope,
        device_ids: scope === 'devices' ? [...selected] : undefined,
        group_id: scope === 'group' ? groupId : undefined,
      });
      Alert.alert('แชร์สำเร็จ', `แชร์ให้ ${email.trim()} แล้ว`, [{ text: 'ตกลง', onPress: () => navigation.goBack() }]);
    } catch (err) {
      Alert.alert('แชร์ไม่สำเร็จ', extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
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
      <TextField
        label="อีเมลของบัญชีที่ต้องการแชร์ให้"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        placeholder="friend@example.com"
      />

      <Text style={styles.label}>สิทธิ์ที่ให้</Text>
      <Segmented
        value={permission}
        onChange={setPermission}
        options={[
          { value: 'view', label: 'ดูอย่างเดียว' },
          { value: 'control', label: 'ควบคุมได้' },
        ]}
      />

      <Text style={styles.label}>แชร์อะไร</Text>
      <Segmented
        value={scope}
        onChange={setScope}
        options={[
          { value: 'all', label: 'ทุกอุปกรณ์ของฉัน' },
          { value: 'devices', label: 'เลือกบางอุปกรณ์' },
          { value: 'group', label: 'ทั้งกลุ่ม' },
        ]}
      />

      {scope === 'all' && (
        <Text style={styles.hint}>รวมอุปกรณ์ที่คุณเพิ่มในอนาคตด้วย ยกเลิกการแชร์ได้ทุกเมื่อ</Text>
      )}
      {scope === 'devices' && <DevicePicker devices={devices} selected={selected} onChange={setSelected} />}
      {scope === 'group' && (
        <View>
          {groups.length === 0 && <Text style={styles.hint}>ยังไม่มีกลุ่ม ไปสร้างกลุ่มที่เมนู "กลุ่ม" ก่อน</Text>}
          <Segmented
            value={groupId ?? ''}
            onChange={setGroupId}
            options={groups.map((g) => ({ value: g.id, label: `${g.name} (${g.device_ids.length})` }))}
          />
        </View>
      )}

      <Button title="แชร์" onPress={submit} loading={saving} style={styles.btn} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  container: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  label: { color: colors.textSecondary, fontSize: 13, fontWeight: '500', marginBottom: spacing.sm },
  hint: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.md, lineHeight: 20 },
  btn: { marginTop: spacing.md },
});
