import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { profilesApi } from '@/api/endpoints';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Segmented';
import { TextField } from '@/components/TextField';
import { colors, radius, spacing } from '@/theme';
import type { Device, DeviceProfile } from '@/types/api';

const INTEGRATION_TH: Record<DeviceProfile['integration'], string> = {
  rtsp: 'กล้อง RTSP',
  direct: 'เชื่อมตรง (โค้ด/เฟิร์มแวร์)',
  script: 'สคริปต์ในอุปกรณ์',
  rule: 'กฎในเฟิร์มแวร์ (ส่งข้อมูลอย่างเดียว)',
  bridge: 'ต้องมีตัวกลาง (Node-RED)',
  planned: 'ยังไม่รองรับเต็มรูปแบบ',
};

const render = (text: string, vars: Record<string, string>) =>
  text.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => (vars[k] ? vars[k] : `<${k}>`));

/** เลือกรุ่นอุปกรณ์จากแคตตาล็อก: เติมชื่อ + สร้าง RTSP URL ให้กล้อง (ส่วนโค้ด/ขั้นตอนของอุปกรณ์ MQTT ดูได้ใน Web Admin หลังเพิ่มอุปกรณ์) */
export function ProfilePickerSection({
  type,
  onName,
  onRtsp,
}: {
  type: Device['type'];
  onName: (name: string) => void;
  onRtsp: (url: string) => void;
}) {
  const [all, setAll] = useState<DeviceProfile[]>([]);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<DeviceProfile | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [variant, setVariant] = useState('0');

  useEffect(() => {
    profilesApi.list(type).then(setAll).catch(() => setAll([]));
    setPicked(null);
  }, [type]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((p) => !needle || `${p.vendor} ${p.model} ${p.tags.join(' ')}`.toLowerCase().includes(needle)).slice(0, 12);
  }, [all, q]);

  if (all.length === 0) return null;

  function choose(p: DeviceProfile) {
    setPicked(p);
    setOpen(false);
    setVariant('0');
    setValues(Object.fromEntries(p.fields.filter((f) => f.default !== undefined).map((f) => [f.key, f.default as string])));
    onName(p.default_name || `${p.vendor} ${p.model}`);
  }

  const tpl = picked?.rtsp_templates[Number(variant)];
  const rtspUrl = tpl ? render(tpl.url, values) : '';

  return (
    <View style={styles.box}>
      <Pressable onPress={() => setOpen((v) => !v)}>
        <Text style={styles.title}>{picked ? `รุ่น: ${picked.vendor} — ${picked.model}` : 'เลือกรุ่นจากแคตตาล็อก (ไม่บังคับ)'}</Text>
        <Text style={styles.hint}>{open ? 'แตะเพื่อซ่อน' : 'แตะเพื่อเลือกยี่ห้อ/รุ่น ระบบช่วยตั้งค่าให้'}</Text>
      </Pressable>

      {open && (
        <>
          <TextField label="ค้นหา" value={q} onChangeText={setQ} placeholder="เช่น hikvision, tasmota, dht22" autoCapitalize="none" />
          {filtered.map((p) => (
            <Pressable key={p.id} style={styles.item} onPress={() => choose(p)}>
              <Text style={styles.itemTitle}>{p.vendor} — {p.model}</Text>
              <Text style={styles.itemSub}>{INTEGRATION_TH[p.integration]}</Text>
            </Pressable>
          ))}
          {filtered.length === 0 && <Text style={styles.hint}>ไม่พบรุ่นที่ค้นหา</Text>}
        </>
      )}

      {picked && !open && (
        <>
          {!!picked.description && <Text style={styles.desc}>{picked.description}</Text>}
          {picked.integration === 'planned' && <Text style={styles.warn}>รุ่นนี้ยังรองรับไม่เต็มรูปแบบ — {picked.notes}</Text>}

          {picked.rtsp_templates.length > 0 && (
            <>
              {picked.fields.map((f) => (
                <TextField
                  key={f.key}
                  label={f.label}
                  value={values[f.key] ?? ''}
                  onChangeText={(v) => setValues({ ...values, [f.key]: v })}
                  placeholder={f.placeholder}
                  secureTextEntry={f.secret}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              ))}
              {picked.rtsp_templates.length > 1 && (
                <Segmented
                  value={variant}
                  onChange={setVariant}
                  options={picked.rtsp_templates.map((t, i) => ({ value: String(i), label: t.label.slice(0, 18) }))}
                />
              )}
              <Text style={styles.url}>{rtspUrl}</Text>
              <Button title="ใช้ URL นี้" variant="secondary" onPress={() => onRtsp(rtspUrl)} />
              <Text style={styles.hint}>ทดสอบ URL ด้วย VLC ก่อนถ้าภาพไม่ขึ้น (รุ่น/เฟิร์มแวร์ต่างกันอาจใช้ path ไม่เหมือนกัน)</Text>
            </>
          )}

          {picked.protocol === 'mqtt' && (
            <Text style={styles.hint}>
              เพิ่มอุปกรณ์แล้วเปิดหน้าอุปกรณ์เพื่อออกรหัส MQTT — โค้ดตัวอย่างและขั้นตอนตั้งค่าของรุ่นนี้ดูได้ใน Web Admin (หน้าอุปกรณ์ → คู่มือตั้งค่าตามรุ่น)
            </Text>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, backgroundColor: colors.surface },
  title: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  hint: { color: colors.textMuted, fontSize: 12, marginTop: spacing.xs },
  desc: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.sm },
  warn: { color: colors.danger, fontSize: 12, marginTop: spacing.sm },
  item: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  itemTitle: { color: colors.textPrimary, fontSize: 14 },
  itemSub: { color: colors.textMuted, fontSize: 12 },
  url: { color: colors.textPrimary, fontSize: 12, marginVertical: spacing.sm },
});
