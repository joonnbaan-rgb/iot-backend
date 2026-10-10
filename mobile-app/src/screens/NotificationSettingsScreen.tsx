import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { notificationsApi } from '@/api/endpoints';
import { extractErrorMessage } from '@/api/client';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { colors, radius, spacing } from '@/theme';
import type { LinkCode, NotificationSettingsView } from '@/types/api';

const EVENT_LABEL: Record<string, string> = {
  device_offline: 'อุปกรณ์ออฟไลน์',
  rule_triggered: 'กฎอัตโนมัติทำงาน',
  command_timeout: 'คำสั่งหมดเวลา (อุปกรณ์ไม่ตอบ)',
};
const TYPE_LABEL = { telegram: 'Telegram', line: 'LINE', email: 'อีเมล' } as const;

export function NotificationSettingsScreen() {
  const [s, setS] = useState<NotificationSettingsView | null>(null);
  const [link, setLink] = useState<(LinkCode & { type: 'telegram' | 'line' }) | null>(null);
  const [qStart, setQStart] = useState('');
  const [qEnd, setQEnd] = useState('');
  const linkRef = useRef(link);
  linkRef.current = link;

  const apply = useCallback((v: NotificationSettingsView) => {
    setS(v);
    setQStart(v.quiet_start == null ? '' : String(v.quiet_start));
    setQEnd(v.quiet_end == null ? '' : String(v.quiet_end));
  }, []);

  const load = useCallback(async () => {
    try {
      apply(await notificationsApi.settings());
    } catch (err) {
      Alert.alert('โหลดไม่สำเร็จ', extractErrorMessage(err));
    }
  }, [apply]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // ระหว่างรอผูก Telegram/LINE: ถามสถานะซ้ำ ถ้ามีช่องทางใหม่ปรากฏ = ผูกสำเร็จ
  useEffect(() => {
    if (!link) return;
    const before = s?.channels.filter((c) => c.type === link.type).length ?? 0;
    const t = setInterval(async () => {
      try {
        const v = await notificationsApi.settings();
        if (v.channels.filter((c) => c.type === link.type).length > before) {
          apply(v);
          setLink(null);
          Alert.alert('สำเร็จ', `เชื่อมต่อ ${TYPE_LABEL[link.type]} เรียบร้อยแล้ว`);
        }
      } catch {
        /* ลองใหม่รอบหน้า */
      }
      if (linkRef.current && new Date(linkRef.current.expires_at).getTime() < Date.now()) setLink(null);
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link?.code]);

  async function run(fn: () => Promise<NotificationSettingsView | void>, failTitle: string) {
    try {
      const v = await fn();
      if (v) apply(v);
    } catch (err) {
      Alert.alert(failTitle, extractErrorMessage(err));
    }
  }

  async function startLink(type: 'telegram' | 'line') {
    try {
      setLink({ ...(await notificationsApi.linkCode(type)), type });
    } catch (err) {
      Alert.alert('ขอรหัสไม่สำเร็จ', extractErrorMessage(err));
    }
  }

  function toggleEvent(ev: string) {
    if (!s) return;
    const next = s.events.includes(ev) ? s.events.filter((e) => e !== ev) : [...s.events, ev];
    run(() => notificationsApi.saveSettings({ events: next }), 'บันทึกไม่สำเร็จ');
  }

  function saveQuiet() {
    const a = qStart.trim();
    const b = qEnd.trim();
    if ((a === '') !== (b === '')) {
      Alert.alert('กรอกไม่ครบ', 'ระบุทั้งเวลาเริ่มและเวลาสิ้นสุด หรือเว้นว่างทั้งคู่เพื่อปิดช่วงเงียบ');
      return;
    }
    const n = (v: string) => (v === '' ? null : parseInt(v, 10));
    const x = n(a);
    const y = n(b);
    if ([x, y].some((v) => v !== null && (Number.isNaN(v) || v < 0 || v > 23))) {
      Alert.alert('ไม่ถูกต้อง', 'ใส่ชั่วโมง 0-23');
      return;
    }
    run(() => notificationsApi.saveSettings({ quiet_start: x, quiet_end: y }), 'บันทึกไม่สำเร็จ');
  }

  async function sendTest() {
    try {
      const res = await notificationsApi.test();
      if (res.length === 0) return Alert.alert('ยังไม่มีช่องทาง', 'เพิ่มช่องทางด้านบนก่อน');
      Alert.alert(
        'ผลการทดสอบ',
        res.map((r) => `${r.ok ? '✅' : '❌'} ${r.channel} (${r.target})${r.error ? `\n   ${r.error}` : ''}`).join('\n'),
      );
    } catch (err) {
      Alert.alert('ทดสอบไม่สำเร็จ', extractErrorMessage(err));
    }
  }

  if (!s) return <View style={styles.container} />;

  const providerHint = (ok: boolean) => (ok ? '' : ' (เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า)');

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }}>
      <Text style={styles.heading}>ช่องทางที่รับแจ้งเตือน</Text>
      <Text style={styles.hint}>การแจ้งเตือนจะแสดงในแอปเสมอ และส่งต่อไปยังช่องทางที่เปิดไว้ด้านล่าง</Text>

      {s.channels.map((c) => (
        <View key={c.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{TYPE_LABEL[c.type]}</Text>
            <Text style={styles.rowSub}>{c.label}</Text>
          </View>
          <Switch
            value={c.enabled}
            onValueChange={(v) => run(() => notificationsApi.setChannel(c.id, v), 'ไม่สำเร็จ')}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
          <Pressable
            onPress={() =>
              Alert.alert('ลบช่องทาง', `ลบ ${TYPE_LABEL[c.type]} นี้?`, [
                { text: 'ยกเลิก', style: 'cancel' },
                {
                  text: 'ลบ',
                  style: 'destructive',
                  onPress: () => run(async () => (await notificationsApi.removeChannel(c.id), notificationsApi.settings()), 'ลบไม่สำเร็จ'),
                },
              ])
            }
            hitSlop={8}
          >
            <Text style={styles.del}>ลบ</Text>
          </Pressable>
        </View>
      ))}

      {link && (
        <View style={styles.linkBox}>
          <Text style={styles.rowTitle}>รหัสเชื่อมต่อ {TYPE_LABEL[link.type]}</Text>
          <Text style={styles.code}>{link.code}</Text>
          <Text style={styles.rowSub}>{link.instructions}</Text>
          {!!link.open_url && (
            <Button
              title={`เปิด ${TYPE_LABEL[link.type]}`}
              onPress={() => Linking.openURL(link.open_url as string)}
              style={{ marginTop: spacing.sm }}
            />
          )}
          <Text style={styles.rowSub}>กำลังรอการเชื่อมต่อ…</Text>
        </View>
      )}

      <View style={styles.btnRow}>
        <Button
          title="+ Telegram"
          variant="secondary"
          disabled={!s.providers.telegram}
          onPress={() => startLink('telegram')}
          style={styles.flex}
        />
        <Button
          title="+ LINE"
          variant="secondary"
          disabled={!s.providers.line}
          onPress={() => startLink('line')}
          style={styles.flex}
        />
        <Button
          title="+ อีเมล"
          variant="secondary"
          disabled={!s.providers.email || s.channels.some((c) => c.type === 'email')}
          onPress={() => run(() => notificationsApi.addEmail(), 'เพิ่มอีเมลไม่สำเร็จ')}
          style={styles.flex}
        />
      </View>
      <Text style={styles.hint}>
        {providerHint(s.providers.telegram) && `Telegram${providerHint(s.providers.telegram)} `}
        {providerHint(s.providers.line) && `LINE${providerHint(s.providers.line)} `}
        {providerHint(s.providers.email) && `อีเมล${providerHint(s.providers.email)}`}
        {s.account_email ? `\nอีเมลจะส่งไปที่ ${s.account_email}` : ''}
      </Text>
      <Button title="ส่งข้อความทดสอบ" onPress={sendTest} style={{ marginTop: spacing.sm }} />

      <Text style={[styles.heading, { marginTop: spacing.xl }]}>เหตุการณ์ที่ต้องการรับ</Text>
      {s.all_events.map((ev) => (
        <View key={ev} style={styles.row}>
          <Text style={[styles.rowTitle, { flex: 1 }]}>{EVENT_LABEL[ev] ?? ev}</Text>
          <Switch
            value={s.events.includes(ev)}
            onValueChange={() => toggleEvent(ev)}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
      ))}

      <Text style={[styles.heading, { marginTop: spacing.xl }]}>ช่วงเวลาเงียบ</Text>
      <Text style={styles.hint}>
        ช่วงนี้จะไม่ส่งไป Telegram/LINE/อีเมล (ยังบันทึกในแอป) ใส่ชั่วโมง 0-23 เวลาไทย เช่น 22 ถึง 7 หรือเว้นว่างเพื่อปิด
      </Text>
      <View style={styles.btnRow}>
        <View style={styles.flex}>
          <TextField label="ตั้งแต่ (ชม.)" value={qStart} onChangeText={setQStart} keyboardType="number-pad" maxLength={2} />
        </View>
        <View style={styles.flex}>
          <TextField label="ถึง (ชม.)" value={qEnd} onChangeText={setQEnd} keyboardType="number-pad" maxLength={2} />
        </View>
      </View>
      <Button title="บันทึกช่วงเวลาเงียบ" variant="secondary" onPress={saveQuiet} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  heading: { color: colors.textPrimary, fontSize: 17, fontWeight: '700', marginBottom: spacing.xs },
  hint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  rowSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  del: { color: colors.danger, fontSize: 13 },
  linkBox: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.primary,
    padding: spacing.md,
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  code: { color: colors.primary, fontSize: 34, fontWeight: '800', letterSpacing: 6, marginVertical: spacing.sm },
  btnRow: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
