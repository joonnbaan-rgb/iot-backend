import { useMemo, useState } from 'react';
import { api } from '../lib/api';
import { TYPE_LABEL, type DeviceProfile, type DeviceType } from '../lib/types';
import { useLoad } from './ui';

/** เลือกรุ่นอุปกรณ์จากแคตตาล็อก (ค้นหาตามยี่ห้อ/รุ่น แล้วเลือกจากรายการแบ่งตามประเภท) */
export function ProfilePicker({
  value,
  onPick,
  onlyType,
}: {
  value: string | null;
  onPick: (p: DeviceProfile | null) => void;
  onlyType?: DeviceType;
}) {
  const all = useLoad(() => api.deviceProfiles(), []);
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = (all.data ?? []).filter(
      (p) =>
        (!onlyType || p.device_type === onlyType) &&
        (!needle || `${p.vendor} ${p.model} ${p.tags.join(' ')}`.toLowerCase().includes(needle)),
    );
    const out = new Map<DeviceType, DeviceProfile[]>();
    for (const p of rows) out.set(p.device_type, [...(out.get(p.device_type) ?? []), p]);
    return out;
  }, [all.data, q, onlyType]);

  return (
    <div className="form">
      <label className="field">
        <span>รุ่นอุปกรณ์จากแคตตาล็อก (ไม่บังคับ — เลือกแล้วระบบเติมค่าและคู่มือตั้งค่าให้)</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหายี่ห้อ/รุ่น เช่น hikvision, tasmota, dht22" />
      </label>
      <select
        value={value ?? ''}
        onChange={(e) => onPick((all.data ?? []).find((p) => p.id === e.target.value) ?? null)}
        size={1}
      >
        <option value="">— ไม่เลือกรุ่น (กรอกเอง) —</option>
        {[...groups.entries()].map(([type, items]) => (
          <optgroup key={type} label={TYPE_LABEL[type]}>
            {items.map((p) => <option key={p.id} value={p.id}>{p.vendor} — {p.model}</option>)}
          </optgroup>
        ))}
      </select>
      {all.error && <div className="muted small">โหลดแคตตาล็อกไม่สำเร็จ: {all.error}</div>}
    </div>
  );
}
