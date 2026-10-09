import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '@/theme';
import type { Device } from '@/types/api';

const TYPE_LABEL: Record<Device['type'], string> = {
  sensor: 'เซนเซอร์',
  camera: 'กล้อง IP',
  actuator: 'อุปกรณ์ไฟฟ้า',
};

interface Props {
  devices: Device[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}

/** รายการอุปกรณ์แบบเลือกได้หลายอัน (ใช้ในหน้ากลุ่มและหน้าแชร์) */
export function DevicePicker({ devices, selected, onChange }: Props) {
  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange(next);
  }
  const allSelected = devices.length > 0 && devices.every((d) => selected.has(d.id));

  if (devices.length === 0) {
    return <Text style={styles.empty}>ยังไม่มีอุปกรณ์ของคุณ</Text>;
  }

  return (
    <View>
      <Pressable onPress={() => onChange(allSelected ? new Set() : new Set(devices.map((d) => d.id)))}>
        <Text style={styles.selectAll}>{allSelected ? 'ยกเลิกเลือกทั้งหมด' : 'เลือกทั้งหมด'}</Text>
      </Pressable>
      {devices.map((d) => {
        const on = selected.has(d.id);
        return (
          <Pressable key={d.id} onPress={() => toggle(d.id)} style={[styles.row, on && styles.rowOn]}>
            <View style={[styles.box, on && styles.boxOn]}>{on && <Text style={styles.tick}>✓</Text>}</View>
            <View style={styles.flex}>
              <Text style={styles.name}>{d.name}</Text>
              <Text style={styles.meta}>{TYPE_LABEL[d.type]}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  empty: { color: colors.textMuted, fontSize: 13 },
  selectAll: { color: colors.primary, fontSize: 13, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    marginBottom: spacing.xs,
  },
  rowOn: { borderColor: colors.primary },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tick: { color: colors.white, fontSize: 14, fontWeight: '700' },
  name: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  meta: { color: colors.textSecondary, fontSize: 12 },
});
