import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { devicesApi } from '@/api/endpoints';
import { extractErrorMessage } from '@/api/client';
import { getSocket, type DeviceStatusEvent } from '@/realtime/socket';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/Button';
import { DeviceIcon, ICONS, ICON_KEYS, inferIcon, type IconKey } from '@/components/DeviceIcon';
import { colors, radius, spacing } from '@/theme';
import type { Device } from '@/types/api';
import type { DevicesStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<DevicesStackParamList, 'FloorPlan'>;

const W = 84; // กว้างของไอคอน+ชื่อ
const H = 96;

/** ตำแหน่งเก็บเป็นสัดส่วน 0..1 ของพื้นที่ว่าง จึงใช้ได้ทุกขนาดหน้าจอ */
interface Placed {
  fx: number;
  fy: number;
  icon?: IconKey;
}
type Layout = Record<string, Placed>;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function FloorPlanScreen({ navigation }: Props) {
  const { user } = useAuth();
  const storageKey = `floorplan:v1:${user?.id ?? 'anon'}`;
  const [devices, setDevices] = useState<Device[]>([]);
  const [layout, setLayout] = useState<Layout>({});
  const [loaded, setLoaded] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const layoutRef = useRef<Layout>({});
  layoutRef.current = layout;

  const persist = useCallback(
    (next: Layout) => {
      setLayout(next);
      AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => undefined);
    },
    [storageKey],
  );

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        try {
          const [list, saved] = await Promise.all([devicesApi.list(), AsyncStorage.getItem(storageKey)]);
          if (!alive) return;
          setDevices(list);
          if (saved) setLayout(JSON.parse(saved) as Layout);
          setError(null);
        } catch (err) {
          if (alive) setError(extractErrorMessage(err));
        } finally {
          if (alive) setLoaded(true);
        }
      })();
      return () => {
        alive = false;
      };
    }, [storageKey]),
  );

  // สถานะออนไลน์/ออฟไลน์อัปเดตสดบนแผนผัง
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onStatus = (p: DeviceStatusEvent) =>
      setDevices((prev) => prev.map((d) => (d.id === p.device_id ? { ...d, status: p.status as Device['status'] } : d)));
    socket.on('device:status', onStatus);
    return () => {
      socket.off('device:status', onStatus);
    };
  }, []);

  // ตำแหน่งตั้งต้นของอุปกรณ์ที่ยังไม่เคยวาง: เรียงเป็นตาราง
  const placed = useMemo(() => {
    if (!size) return {} as Record<string, Placed>;
    const cols = Math.max(1, Math.floor(size.w / (W + 8)));
    const freeW = Math.max(1, size.w - W);
    const freeH = Math.max(1, size.h - H);
    const out: Record<string, Placed> = {};
    let n = 0;
    for (const d of devices) {
      if (layout[d.id]) {
        out[d.id] = layout[d.id];
      } else {
        const col = n % cols;
        const row = Math.floor(n / cols);
        out[d.id] = { fx: clamp((col * (W + 8)) / freeW, 0, 1), fy: clamp((row * (H + 8)) / freeH, 0, 1) };
        n++;
      }
    }
    return out;
  }, [devices, layout, size]);

  function move(id: string, fx: number, fy: number) {
    persist({ ...layoutRef.current, [id]: { ...(placed[id] ?? {}), fx, fy } });
  }

  function setIcon(id: string, icon: IconKey | undefined) {
    persist({ ...layoutRef.current, [id]: { ...(placed[id] ?? { fx: 0, fy: 0 }), icon } });
  }

  function autoArrange() {
    persist({});
    setSelected(null);
  }

  const sel = devices.find((d) => d.id === selected) ?? null;

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>แตะค้างแล้วลากไอคอนไปวางตำแหน่งที่ต้องการ · แตะเพื่อเลือกและเปลี่ยนไอคอน</Text>
      {!!error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.canvas} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        <GridDots />
        {loaded && devices.length === 0 && <Text style={styles.empty}>ยังไม่มีอุปกรณ์ให้วาง</Text>}
        {size &&
          devices.map((d) => {
            const p = placed[d.id];
            const icon = p?.icon ?? inferIcon(d);
            return (
              <DraggableDevice
                // remount เมื่อขนาดพื้นที่เปลี่ยน (หมุนจอ) เพื่อคำนวณตำแหน่งใหม่
                key={`${d.id}:${Math.round(size.w)}x${Math.round(size.h)}`}
                device={d}
                icon={icon}
                bounds={size}
                fx={p?.fx ?? 0}
                fy={p?.fy ?? 0}
                selected={selected === d.id}
                onMove={(fx, fy) => move(d.id, fx, fy)}
                onTap={() => setSelected((cur) => (cur === d.id ? null : d.id))}
              />
            );
          })}
      </View>

      {sel ? (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>{sel.name}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.iconStrip}>
            {ICON_KEYS.map((k) => {
              const current = (placed[sel.id]?.icon ?? inferIcon(sel)) === k;
              return (
                <Pressable key={k} onPress={() => setIcon(sel.id, k)} style={[styles.pick, current && styles.pickOn]}>
                  <DeviceIcon icon={k} type={sel.type} size={26} />
                  <Text style={styles.pickLabel}>{ICONS[k].label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.row}>
            <Button
              title="เปิดรายละเอียด"
              onPress={() => navigation.navigate('DeviceDetail', { deviceId: sel.id, deviceName: sel.name })}
              style={styles.flex}
            />
            <Button title="ไอคอนอัตโนมัติ" variant="secondary" onPress={() => setIcon(sel.id, undefined)} style={styles.flex} />
          </View>
        </View>
      ) : (
        <Button title="จัดเรียงอัตโนมัติ" variant="secondary" onPress={autoArrange} />
      )}
    </View>
  );
}

function GridDots() {
  // จุดกริดจางๆ ให้รู้สึกเป็นพื้นผังงาน (วาดด้วย View ล้วน ไม่ต้องใช้ SVG pattern)
  const dots = useMemo(() => Array.from({ length: 9 * 14 }, (_, i) => i), []);
  return (
    <View pointerEvents="none" style={styles.grid}>
      {dots.map((i) => (
        <View key={i} style={styles.gridCell}>
          <View style={styles.gridDot} />
        </View>
      ))}
    </View>
  );
}

interface ItemProps {
  device: Device;
  icon: IconKey;
  bounds: { w: number; h: number };
  fx: number;
  fy: number;
  selected: boolean;
  onMove: (fx: number, fy: number) => void;
  onTap: () => void;
}

function DraggableDevice({ device, icon, bounds, fx, fy, selected, onMove, onTap }: ItemProps) {
  const freeW = Math.max(1, bounds.w - W);
  const freeH = Math.max(1, bounds.h - H);
  const pan = useRef(new Animated.ValueXY({ x: fx * freeW, y: fy * freeH })).current;
  const cur = useRef({ x: fx * freeW, y: fy * freeH });
  const start = useRef({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const cb = useRef({ onMove, onTap });
  cb.current = { onMove, onTap };

  useEffect(() => {
    const id = pan.addListener((v) => {
      cur.current = v;
    });
    return () => pan.removeListener(id);
  }, [pan]);

  // ตำแหน่งเปลี่ยนจากภายนอก (เช่น กดจัดเรียงอัตโนมัติ) ขณะไม่ได้ลาก -> เลื่อนตาม
  useEffect(() => {
    if (!dragging) {
      Animated.spring(pan, { toValue: { x: fx * freeW, y: fy * freeH }, useNativeDriver: false, friction: 8 }).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx, fy]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          pan.stopAnimation();
          start.current = { ...cur.current };
          setDragging(true);
        },
        onPanResponderMove: (_, g) => {
          pan.setValue({
            x: clamp(start.current.x + g.dx, 0, freeW),
            y: clamp(start.current.y + g.dy, 0, freeH),
          });
        },
        onPanResponderRelease: (_, g) => {
          setDragging(false);
          if (Math.abs(g.dx) < 6 && Math.abs(g.dy) < 6) {
            cb.current.onTap();
          } else {
            cb.current.onMove(cur.current.x / freeW, cur.current.y / freeH);
          }
        },
        onPanResponderTerminate: () => {
          setDragging(false);
          cb.current.onMove(cur.current.x / freeW, cur.current.y / freeH);
        },
      }),
    [pan, freeW, freeH],
  );

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[
        styles.item,
        { transform: pan.getTranslateTransform() },
        dragging && styles.dragging,
      ]}
    >
      <DeviceIcon icon={icon} type={device.type} status={device.status} tile size={28} highlight={selected || dragging} />
      <Text numberOfLines={1} style={[styles.itemName, selected && styles.itemNameOn]}>
        {device.name}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.md },
  hint: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm },
  error: { color: colors.danger, marginBottom: spacing.sm },
  canvas: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  grid: { ...StyleSheet.absoluteFillObject, flexDirection: 'row', flexWrap: 'wrap' },
  gridCell: { width: `${100 / 9}%`, height: `${100 / 14}%`, alignItems: 'center', justifyContent: 'center' },
  gridDot: { width: 2, height: 2, borderRadius: 1, backgroundColor: colors.border },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },
  item: { position: 'absolute', left: 0, top: 0, width: W, height: H, alignItems: 'center', paddingTop: 4 },
  dragging: { zIndex: 10, opacity: 0.85 },
  itemName: { color: colors.textSecondary, fontSize: 11, marginTop: 4, maxWidth: W },
  itemNameOn: { color: colors.textPrimary, fontWeight: '600' },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  panelTitle: { color: colors.textPrimary, fontWeight: '600', marginBottom: spacing.sm },
  iconStrip: { gap: spacing.sm, paddingBottom: spacing.sm },
  pick: {
    width: 78,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  pickOn: { borderColor: colors.primary },
  pickLabel: { color: colors.textSecondary, fontSize: 10, marginTop: 4, textAlign: 'center' },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
