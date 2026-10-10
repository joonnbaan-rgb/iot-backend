import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { sitesApi } from '@/api/endpoints';
import { extractErrorMessage } from '@/api/client';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Segmented';
import { TextField } from '@/components/TextField';
import { colors, radius, spacing } from '@/theme';
import type { Site, SiteKind } from '@/types/api';
import type { DevicesStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<DevicesStackParamList, 'Sites'>;

export const KIND_LABEL: Record<SiteKind, string> = { home: 'Smart Home', farm: 'IoT Farm', factory: 'Factory' };
export const ROLE_LABEL = { admin: 'ผู้ดูแล', operator: 'ผู้ปฏิบัติงาน', viewer: 'ผู้ชม' } as const;

export function SitesScreen({ navigation }: Props) {
  const [sites, setSites] = useState<Site[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<SiteKind>('home');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      setSites(await sitesApi.list());
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function create() {
    if (!name.trim()) {
      Alert.alert('กรอกไม่ครบ', 'กรุณาตั้งชื่อไซต์');
      return;
    }
    setCreating(true);
    try {
      await sitesApi.create({ name: name.trim(), kind });
      setName('');
      await load();
    } catch (err) {
      Alert.alert('สร้างไซต์ไม่สำเร็จ', extractErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={sites}
        keyExtractor={(s) => s.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View style={styles.form}>
            <Text style={styles.hint}>ไซต์คือพื้นที่ใช้งาน เช่น บ้าน ฟาร์ม หรือโรงงาน เชิญทีมเข้าไซต์พร้อมกำหนดบทบาทได้</Text>
            <TextField label="ชื่อไซต์ใหม่" value={name} onChangeText={setName} placeholder="เช่น ฟาร์มเมลอนบางไทร" />
            <Segmented
              value={kind}
              onChange={setKind}
              options={(Object.keys(KIND_LABEL) as SiteKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
            />
            <Button title="+ สร้างไซต์" onPress={create} loading={creating} />
            {!!error && <Text style={styles.error}>{error}</Text>}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => navigation.navigate('SiteDetail', { siteId: item.id })}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>
              {KIND_LABEL[item.kind]} · {item.device_count} อุปกรณ์ · {item.member_count} สมาชิก · คุณเป็น{ROLE_LABEL[item.my_role]}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.md },
  form: { marginBottom: spacing.md },
  hint: { color: colors.textMuted, marginBottom: spacing.md, lineHeight: 20 },
  error: { color: colors.danger, marginTop: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  name: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
});
