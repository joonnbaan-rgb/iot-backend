import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors } from '@/theme';
import type { Device } from '@/types/api';

/**
 * ชุดไอคอนอุปกรณ์ (เส้นมน 24x24) วาดเองด้วย SVG ใช้ร่วมกันทั้งการ์ด แผนผัง และตัวเลือกไอคอน
 */
export type IconKey =
  | 'sensor' | 'thermometer' | 'humidity' | 'weather' | 'plant' | 'water'
  | 'vibration' | 'power' | 'light' | 'plug' | 'pump' | 'fan' | 'camera' | 'gateway';

interface Glyph {
  label: string;
  paths: string[];
  dots?: [number, number, number][]; // [cx, cy, r] วงกลมเส้น
  fills?: [number, number, number][]; // [cx, cy, r] จุดทึบ
}

export const ICONS: Record<IconKey, Glyph> = {
  sensor: {
    label: 'เซนเซอร์',
    paths: ['M5 12a7 7 0 0 1 14 0', 'M8.5 12a3.5 3.5 0 0 1 7 0', 'M12 16v5', 'M9 21h6'],
    fills: [[12, 12, 1.2]],
  },
  thermometer: {
    label: 'อุณหภูมิ',
    paths: ['M14 14.8V4.5a2.5 2.5 0 0 0-5 0v10.3a4.5 4.5 0 1 0 5 0z', 'M11.5 9v7'],
    fills: [[11.5, 17.5, 1.6]],
  },
  humidity: {
    label: 'ความชื้น',
    paths: ['M12 2.8s6 6.1 6 10.2a6 6 0 0 1-12 0c0-4.1 6-10.2 6-10.2z', 'M9.2 14a3 3 0 0 0 2.4 2.7'],
  },
  weather: {
    label: 'สภาพอากาศ',
    paths: [
      'M12 2v2', 'M4.9 4.9l1.4 1.4', 'M2 12h2', 'M19.1 4.9l-1.4 1.4',
      'M8 19a4 4 0 1 1 1-7.9 5 5 0 0 1 9.4 1.9A3 3 0 0 1 18 19z',
    ],
  },
  plant: {
    label: 'ดิน/พืช',
    paths: ['M12 21V11', 'M12 11c0-4-3-6.5-7-6.5 0 4 3 6.5 7 6.5z', 'M12 14c0-3 2.2-5 6-5 0 3-2.2 5-6 5z', 'M7 21h10'],
  },
  water: {
    label: 'ระดับน้ำ',
    paths: ['M6 3h12v18H6z', 'M6 12c2-2 4 2 6 0s4 2 6 0', 'M6 16c2-2 4 2 6 0s4 2 6 0'],
  },
  vibration: {
    label: 'สั่นสะเทือน',
    paths: ['M2 12h4l2-6 4 12 3-9 2 3h5'],
  },
  power: {
    label: 'ไฟฟ้า',
    paths: ['M13 2 4 14h7l-1 8 9-12h-7z'],
  },
  light: {
    label: 'หลอดไฟ',
    paths: ['M9 18h6', 'M10 21.5h4', 'M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z'],
  },
  plug: {
    label: 'สวิตช์/ปลั๊ก',
    paths: ['M9 2v6', 'M15 2v6', 'M6 8h12v3a6 6 0 0 1-12 0z', 'M12 17v5'],
  },
  pump: {
    label: 'ปั๊ม/วาล์ว',
    paths: ['M16 13h5', 'M10 7V4h5', 'M5 21h12'],
    dots: [[10.5, 13.5, 5.5]],
    fills: [[10.5, 13.5, 1.6]],
  },
  fan: {
    label: 'พัดลม/มอเตอร์',
    paths: [
      'M12 12c-1-4 0-8 3-8 2.5 0 1.5 4-3 8z',
      'M12 12c4-1 8 0 8 3 0 2.5-4 1.5-8-3z',
      'M12 12c1 4 0 8-3 8-2.5 0-1.5-4 3-8z',
      'M12 12c-4 1-8 0-8-3 0-2.5 4-1.5 8 3z',
    ],
    fills: [[12, 12, 1.3]],
  },
  camera: {
    label: 'กล้อง',
    paths: ['M3 9a2 2 0 0 1 2-2h2l1.5-2h7L17 7h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
    dots: [[12, 13, 3.6]],
  },
  gateway: {
    label: 'เกตเวย์',
    paths: ['M4 15h16v6H4z', 'M8 18h.01', 'M12 18h.01', 'M12 15v-3', 'M8.5 9.5a5 5 0 0 1 7 0', 'M6 7a8.5 8.5 0 0 1 12 0'],
  },
};

export const ICON_KEYS = Object.keys(ICONS) as IconKey[];

const KEYWORDS: [RegExp, IconKey][] = [
  [/อุณหภูมิ|ร้อน|temp/i, 'thermometer'],
  [/ชื้น|humid/i, 'humidity'],
  [/ดิน|พืช|แปลง|soil|plant/i, 'plant'],
  [/อากาศ|แดด|weather/i, 'weather'],
  [/น้ำ.*(ระดับ|ถัง)|ระดับน้ำ|ถัง|tank|level/i, 'water'],
  [/สั่น|vibrat/i, 'vibration'],
  [/มิเตอร์|ไฟฟ้า|กำลังไฟ|power|meter|watt/i, 'power'],
  [/ปั๊ม|วาล์ว|pump|valve/i, 'pump'],
  [/พัดลม|มอเตอร์|fan|motor/i, 'fan'],
  [/ไฟ|หลอด|โคม|light|lamp/i, 'light'],
  [/เกตเวย์|gateway|router/i, 'gateway'],
  [/ปลั๊ก|สวิตช์|plug|switch|sonoff/i, 'plug'],
  [/กล้อง|cam/i, 'camera'],
];

/** เดาไอคอนจากชนิด+ชื่ออุปกรณ์ (ผู้ใช้เลือกทับเองได้ในแผนผัง) */
export function inferIcon(device: Pick<Device, 'name' | 'type'>): IconKey {
  if (device.type === 'camera') return 'camera';
  const hit = KEYWORDS.find(([re]) => re.test(device.name));
  if (hit) return hit[1];
  return device.type === 'actuator' ? 'plug' : 'sensor';
}

export const TYPE_COLOR: Record<Device['type'], string> = {
  sensor: '#2dd4bf',
  camera: '#a78bfa',
  actuator: '#fbbf24',
};

interface Props {
  icon: IconKey;
  type?: Device['type'];
  size?: number;
  color?: string;
  /** วาดเป็นกระเบื้องมีพื้นหลัง (ใช้ในแผนผัง/การ์ด) */
  tile?: boolean;
  status?: Device['status'];
  highlight?: boolean;
}

export function DeviceIcon({ icon, type = 'sensor', size = 28, color, tile, status, highlight }: Props) {
  const g = ICONS[icon];
  const c = color ?? TYPE_COLOR[type];
  const glyph = (s: number) => (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {g.paths.map((d, i) => (
        <Path key={i} d={d} />
      ))}
      {g.dots?.map(([cx, cy, r], i) => (
        <Circle key={`c${i}`} cx={cx} cy={cy} r={r} />
      ))}
      {g.fills?.map(([cx, cy, r], i) => (
        <Circle key={`f${i}`} cx={cx} cy={cy} r={r} fill={c} stroke="none" />
      ))}
    </Svg>
  );
  if (!tile) return glyph(size);

  const box = size * 1.9;
  const ring = status === 'online' ? colors.online : colors.offline;
  return (
    <View
      style={[
        styles.tile,
        { width: box, height: box, borderRadius: box * 0.3, borderColor: highlight ? colors.white : ring },
        status === 'offline' && styles.dim,
      ]}
    >
      {glyph(size)}
      {!!status && <View style={[styles.dot, { backgroundColor: ring }]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.65 },
  dot: { position: 'absolute', top: 5, right: 5, width: 9, height: 9, borderRadius: 5 },
});
