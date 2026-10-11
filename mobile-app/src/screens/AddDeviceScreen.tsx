import React, { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { devicesApi, discoveryApi, sitesApi } from '@/api/endpoints';
import { extractErrorMessage } from '@/api/client';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { colors, radius, spacing } from '@/theme';
import { Segmented } from '@/components/Segmented';
import type { Device, DiscoveredDevice, Site } from '@/types/api';
import type { DevicesStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<DevicesStackParamList, 'AddDevice'>;

const TYPE_CARDS: {
  value: Device['type'];
  title: string;
  desc: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { value: 'sensor', title: 'เซนเซอร์', desc: 'วัดอุณหภูมิ ความชื้น ฯลฯ แล้วส่งค่ามาให้ดูและตั้งแจ้งเตือน', icon: 'thermometer-outline' },
  { value: 'actuator', title: 'อุปกรณ์ไฟฟ้า', desc: 'เปิด-ปิดไฟ ปลั๊ก ปั๊มน้ำ พัดลม จากแอปหรือตั้งเวลา/เงื่อนไขอัตโนมัติ', icon: 'power-outline' },
  { value: 'camera', title: 'กล้อง IP', desc: 'ดูภาพสดและย้อนหลังจากกล้อง RTSP', icon: 'videocam-outline' },
];

type Step = 'type' | 'details' | 'done';

export function AddDeviceScreen({ navigation }: Props) {
  const [step, setStep] = useState<Step>('type');
  const [created, setCreated] = useState<Device | null>(null);
  const [showScan, setShowScan] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<Device['type']>('sensor');
  const [location, setLocation] = useState('');
  const [rtspUrl, setRtspUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState<DiscoveredDevice[] | null>(null);
  const [subnet, setSubnet] = useState('');
  const [paired, setPaired] = useState<DiscoveredDevice | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState<string>('');

  // ไซต์ที่เราเป็นผู้ดูแล (วางอุปกรณ์ได้) ค่าเริ่มต้น = ไซต์แรก (ไซต์ส่วนตัว)
  useEffect(() => {
    sitesApi
      .list()
      .then((all) => {
        const mine = all.filter((s) => s.my_role === 'admin');
        setSites(mine);
        if (mine.length > 0) setSiteId(mine[0].id);
      })
      .catch(() => undefined);
  }, []);

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
    setStep('details');
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
      const device = await devicesApi.create({
        name: name.trim(),
        type,
        location: location.trim() || undefined,
        rtsp_url: type === 'camera' && rtspUrl.trim() ? rtspUrl.trim() : undefined,
        connection_protocol: paired ? (paired.kind === 'ip_camera' ? 'rtsp' : paired.kind) : undefined,
        connection_host: paired?.ip,
        site_id: siteId || undefined,
      });
      setCreated(device);
      setStep('done');
    } catch (err) {
      Alert.alert('เพิ่มอุปกรณ์ไม่สำเร็จ', extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const typeTitle = TYPE_CARDS.find((c) => c.value === type)?.title ?? '';

  if (step === 'done' && created) {
    return (
      <ScrollView style={styles.flex} contentContainerStyle={styles.doneWrap}>
        <Ionicons name="checkmark-circle" size={72} color={colors.success} />
        <Text style={styles.doneTitle}>เพิ่ม "{created.name}" แล้ว</Text>
        <Text style={styles.doneHint}>
          คุณเป็นผู้ดูแลอุปกรณ์นี้ ดู ตั้งค่า และแชร์ให้บัญชีอื่นได้
          {type !== 'camera' ? '\nขั้นต่อไป: เปิดอุปกรณ์เพื่อออกรหัสเชื่อมต่อ MQTT ให้เครื่องจริง' : '\nขั้นต่อไป: เปิดอุปกรณ์เพื่อตั้งค่าแหล่งภาพ (RTSP) ถ้ายังไม่ได้ใส่'}
        </Text>
        <Button
          title="เปิดอุปกรณ์นี้"
          onPress={() => navigation.replace('DeviceDetail', { deviceId: created.id, deviceName: created.name })}
          style={styles.doneBtn}
        />
        <Button
          title="แชร์ให้คนอื่น"
          variant="secondary"
          onPress={() => navigation.replace('ShareCreate', { deviceId: created.id })}
          style={styles.doneBtn}
        />
        <Button
          title="เพิ่มอุปกรณ์อีกเครื่อง"
          variant="secondary"
          onPress={() => {
            setCreated(null);
            setName('');
            setLocation('');
            setRtspUrl('');
            setPaired(null);
            setStep('type');
          }}
          style={styles.doneBtn}
        />
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {step === 'type' && (
          <>
            <Text style={styles.heading}>คุณจะเพิ่มอะไร?</Text>
            {TYPE_CARDS.map((c) => (
              <Pressable
                key={c.value}
                style={styles.typeCard}
                onPress={() => {
                  setType(c.value);
                  setStep('details');
                }}
              >
                <View style={styles.typeIcon}>
                  <Ionicons name={c.icon} size={26} color={colors.primary} />
                </View>
                <View style={styles.fill}>
                  <Text style={styles.typeTitle}>{c.title}</Text>
                  <Text style={styles.typeDesc}>{c.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </Pressable>
            ))}

            <Pressable style={styles.scanToggle} onPress={() => setShowScan((v) => !v)}>
              <Ionicons name="search-outline" size={18} color={colors.primary} />
              <Text style={styles.scanToggleText}>
                {showScan ? 'ซ่อนการค้นหาอัตโนมัติ' : 'มีอุปกรณ์ในวง LAN เดียวกับเซิร์ฟเวอร์? ค้นหาอัตโนมัติ'}
              </Text>
            </Pressable>

            {showScan && (
              <View style={styles.scanBox}>
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
                    style={[styles.found, d.already_added && styles.foundDone]}
                  >
                    <Text style={styles.foundName}>{d.name}</Text>
                    <Text style={styles.foundMeta}>
                      {d.ip} · {d.detail}
                    </Text>
                    <Text style={styles.foundAction}>{d.already_added ? 'เพิ่มไว้แล้ว' : 'แตะเพื่อเลือก'}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}

        {step === 'details' && (
          <>
            <Pressable onPress={() => setStep('type')} style={styles.back}>
              <Ionicons name="chevron-back" size={18} color={colors.primary} />
              <Text style={styles.backText}>เปลี่ยนประเภท ({typeTitle})</Text>
            </Pressable>
            <Text style={styles.heading}>ตั้งชื่ออุปกรณ์</Text>
            {paired && (
              <Text style={styles.paired}>
                จับคู่กับ {paired.name} ({paired.ip})
              </Text>
            )}

            <TextField label="ชื่ออุปกรณ์" value={name} onChangeText={setName} placeholder="เช่น เซนเซอร์อุณหภูมิห้องนั่งเล่น" />
            <TextField
              label="ตำแหน่งที่ติดตั้ง (ไม่บังคับ)"
              value={location}
              onChangeText={setLocation}
              placeholder="เช่น ห้องนั่งเล่น ชั้น 1"
            />

            {sites.length > 1 && (
              <>
                <Text style={styles.label}>ไซต์</Text>
                <Segmented value={siteId} onChange={setSiteId} options={sites.map((x) => ({ value: x.id, label: x.name }))} />
              </>
            )}

            {type === 'camera' && (
              <TextField
                label="RTSP URL ของกล้อง (ไม่บังคับ ตั้งทีหลังได้)"
                value={rtspUrl}
                onChangeText={setRtspUrl}
                placeholder="rtsp://192.168.1.x:554/stream"
                autoCapitalize="none"
              />
            )}

            <Button title="เพิ่มอุปกรณ์" onPress={handleSubmit} loading={loading} style={styles.submit} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  heading: { color: colors.textPrimary, fontSize: 22, fontWeight: '700', marginBottom: spacing.md },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  typeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  typeDesc: { color: colors.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 2 },
  scanToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  scanToggleText: { color: colors.primary, fontSize: 13, flex: 1 },
  back: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  backText: { color: colors.primary, fontSize: 13 },
  paired: { color: colors.success, fontSize: 13, marginBottom: spacing.md },
  doneWrap: { alignItems: 'center', padding: spacing.lg, paddingTop: spacing.xl * 2 },
  doneTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: '700', marginTop: spacing.md, textAlign: 'center' },
  doneHint: { color: colors.textSecondary, fontSize: 14, lineHeight: 22, textAlign: 'center', marginVertical: spacing.md },
  doneBtn: { alignSelf: 'stretch', marginTop: spacing.sm },
  flex: { flex: 1, backgroundColor: colors.bg },
  fill: { flex: 1 },
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
