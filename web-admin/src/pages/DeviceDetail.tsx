import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { getSocket, useSocketEvent } from '../lib/socket';
import { DeviceGlyph, inferIcon } from '../lib/deviceIcons';
import { TYPE_LABEL, type Device, type DeviceCommand, type MqttCredentials, type SensorPoint, type StreamUrls } from '../lib/types';
import { fmtDateTime, fmtNum, timeAgo } from '../lib/format';
import { ErrorBox, Modal, PageHead, StatusPill, errMsg, useLoad } from '../components/ui';
import { LineChart } from '../components/LineChart';
import { HlsPlayer } from '../components/HlsPlayer';

const RANGES = { '1h': 3600e3, '24h': 86400e3, '7d': 7 * 86400e3 } as const;
type Range = keyof typeof RANGES;

export function DeviceDetail() {
  const { id = '' } = useParams();
  const dev = useLoad(() => api.device(id), [id]);
  const d = dev.data;

  useSocketEvent<{ device_id: string; status: string }>('device:status', (p) => {
    if (p.device_id === id) dev.setData((prev) => (prev ? { ...prev, status: p.status as Device['status'] } : prev));
  });

  if (dev.error) return <><PageHead title="อุปกรณ์" /><ErrorBox message={dev.error} /><Link to="/devices">← กลับ</Link></>;
  if (!d) return <div className="muted">กำลังโหลด…</div>;

  const level = d.access_level ?? 'view';
  const canControl = level === 'admin' || level === 'owner' || level === 'control';
  const canManage = level === 'admin' || level === 'owner';

  return (
    <>
      <PageHead
        title={d.name}
        sub={
          <span className="head-sub">
            <DeviceGlyph icon={inferIcon(d)} type={d.type} size={18} /> {TYPE_LABEL[d.type]}
            {d.location ? ` · ${d.location}` : ''} · <StatusPill status={d.status} /> · อัปเดต {timeAgo(d.last_seen_at)}
            {d.owner_email ? ` · แชร์จาก ${d.owner_email}` : ''}
          </span>
        }
        actions={<Link className="btn ghost" to="/devices">← รายการ</Link>}
      />

      {d.type === 'camera' ? <CameraPanel id={id} /> : <TelemetryPanel id={id} />}
      {canControl && d.type !== 'camera' && <CommandsPanel id={id} />}
      {canManage && <ManagePanel device={d} onChanged={dev.reload} />}
    </>
  );
}

function CameraPanel({ id }: { id: string }) {
  const s = useLoad<StreamUrls>(() => api.stream(id), [id]);
  return (
    <section className="card">
      <h2>ภาพสด</h2>
      <ErrorBox message={s.error} />
      {s.data && !s.data.source_configured && <div className="muted">ยังไม่ได้ตั้งค่าแหล่งภาพ (RTSP) ของกล้องนี้</div>}
      {s.data?.source_configured && <HlsPlayer src={s.data.hls_url} />}
    </section>
  );
}

function TelemetryPanel({ id }: { id: string }) {
  const [range, setRange] = useState<Range>('24h');
  const [points, setPoints] = useState<SensorPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api
      .telemetry(id, { limit: 500, from: new Date(Date.now() - RANGES[range]).toISOString() })
      .then((rows) => {
        if (!alive) return;
        setPoints([...rows].reverse());
        setError(null);
      })
      .catch((e) => alive && setError(errMsg(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id, range]);

  // ค่าสด: subscribe ห้องของอุปกรณ์ (ต่อใหม่ทุกครั้งที่ socket reconnect)
  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const sub = () => s.emit('subscribe:device', id);
    sub();
    s.on('connect', sub);
    return () => {
      s.off('connect', sub);
      s.emit('unsubscribe:device', id);
    };
  }, [id]);

  useSocketEvent<{ device_id: string; value: number; unit: string | null; recorded_at: string }>('telemetry', (p) => {
    if (p.device_id !== id) return;
    setPoints((prev) => [...prev.slice(-499), { device_id: id, value: p.value, unit: p.unit, recorded_at: p.recorded_at }]);
  });

  const chart = useMemo(() => points.map((p) => ({ t: new Date(p.recorded_at).getTime(), v: p.value })), [points]);
  const last = points[points.length - 1];
  const vals = points.map((p) => p.value);

  return (
    <section className="card">
      <div className="card-head">
        <h2>ค่าที่วัดได้</h2>
        <div className="seg">
          {(Object.keys(RANGES) as Range[]).map((r) => (
            <button key={r} className={r === range ? 'on' : ''} onClick={() => setRange(r)}>{r}</button>
          ))}
        </div>
      </div>
      <ErrorBox message={error} />
      <div className="stats">
        <div><span>ล่าสุด</span><b className="mono">{last ? fmtNum(last.value) : '—'}</b><small>{last?.unit ?? ''}</small></div>
        <div><span>ต่ำสุด</span><b className="mono">{vals.length ? fmtNum(Math.min(...vals)) : '—'}</b></div>
        <div><span>สูงสุด</span><b className="mono">{vals.length ? fmtNum(Math.max(...vals)) : '—'}</b></div>
        <div><span>เฉลี่ย</span><b className="mono">{vals.length ? fmtNum(vals.reduce((a, b) => a + b, 0) / vals.length) : '—'}</b></div>
      </div>
      {loading ? <div className="muted">กำลังโหลด…</div> : <LineChart points={chart} unit={last?.unit} />}
    </section>
  );
}

function CommandsPanel({ id }: { id: string }) {
  const cmds = useLoad<DeviceCommand[]>(() => api.commands(id), [id]);
  const [action, setAction] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useSocketEvent<{ device_id: string }>('command:status', (p) => {
    if (p.device_id === id) void cmds.reload();
  });

  const send = useCallback(
    async (a: string) => {
      if (!a.trim()) return;
      setBusy(true);
      setError(null);
      try {
        await api.sendCommand(id, a.trim());
        setAction('');
        await cmds.reload();
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );

  return (
    <section className="card">
      <h2>สั่งงาน</h2>
      <div className="cmd-row">
        <button className="btn primary" disabled={busy} onClick={() => void send('turn_on')}>เปิด (turn_on)</button>
        <button className="btn" disabled={busy} onClick={() => void send('turn_off')}>ปิด (turn_off)</button>
        <form onSubmit={(e) => { e.preventDefault(); void send(action); }} className="inline">
          <input placeholder="คำสั่งอื่น" value={action} onChange={(e) => setAction(e.target.value)} maxLength={64} />
          <button className="btn ghost" disabled={busy || !action.trim()}>ส่ง</button>
        </form>
      </div>
      <ErrorBox message={error} />
      <ul className="feed">
        {(cmds.data ?? []).map((c) => (
          <li key={c.id}>
            <span className={`tag ${c.status}`}>{c.status}</span>
            <span className="feed-msg mono">{c.action}</span>
            <span className="muted small">{fmtDateTime(c.created_at)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ManagePanel({ device, onChanged }: { device: Device; onChanged: () => Promise<void> }) {
  const nav = useNavigate();
  const sites = useLoad(() => api.sites(), []);
  const [name, setName] = useState(device.name);
  const [location, setLocation] = useState(device.location ?? '');
  const [siteId, setSiteId] = useState(device.site_id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creds, setCreds] = useState<MqttCredentials | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.updateDevice(device.id, {
        name: name.trim(),
        location: location.trim(),
        site_id: siteId && siteId !== device.site_id ? siteId : undefined,
      });
      await onChanged();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function issue() {
    if (device.mqtt_credentials_at && !window.confirm('รหัสเดิมจะใช้ไม่ได้ทันที ต้องตั้งรหัสใหม่ในตัวอุปกรณ์ ดำเนินการต่อ?')) return;
    try {
      setCreds(await api.issueMqtt(device.id));
      await onChanged();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  async function revoke() {
    if (!window.confirm('เพิกถอนรหัส? อุปกรณ์จะเชื่อมต่อ MQTT ไม่ได้จนกว่าจะออกรหัสใหม่')) return;
    try {
      await api.revokeMqtt(device.id);
      await onChanged();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  async function remove() {
    if (!window.confirm(`ลบ "${device.name}" พร้อมข้อมูลทั้งหมด? ย้อนกลับไม่ได้`)) return;
    try {
      await api.deleteDevice(device.id);
      nav('/devices');
    } catch (err) {
      setError(errMsg(err));
    }
  }

  const adminSites = (sites.data ?? []).filter((s) => s.my_role === 'admin');

  return (
    <section className="card">
      <h2>ตั้งค่า</h2>
      <ErrorBox message={error} />
      <form onSubmit={save} className="form row">
        <label className="field"><span>ชื่อ</span><input value={name} onChange={(e) => setName(e.target.value)} required maxLength={128} /></label>
        <label className="field"><span>ตำแหน่ง</span><input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={128} /></label>
        <label className="field">
          <span>ไซต์</span>
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            {!device.site_id && <option value="">— ไม่สังกัด —</option>}
            {adminSites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <button className="btn primary" disabled={busy || !name.trim()}>บันทึก</button>
      </form>

      {device.type !== 'camera' && (
        <div className="subsec">
          <h3>รหัสเชื่อมต่อ MQTT</h3>
          <p className="muted small">
            {device.mqtt_credentials_at
              ? `ออกรหัสเมื่อ ${fmtDateTime(device.mqtt_credentials_at)}`
              : 'ยังไม่ได้ออกรหัส — อุปกรณ์เชื่อมต่อ MQTT บน cloud ไม่ได้'}
          </p>
          <div className="row-btns">
            <button className="btn" onClick={() => void issue()}>{device.mqtt_credentials_at ? 'ออกรหัสใหม่' : 'ออกรหัสเชื่อมต่อ'}</button>
            {device.mqtt_credentials_at && <button className="btn danger" onClick={() => void revoke()}>เพิกถอน</button>}
          </div>
        </div>
      )}

      <div className="subsec">
        <h3>โซนอันตราย</h3>
        <button className="btn danger" onClick={() => void remove()}>ลบอุปกรณ์</button>
      </div>

      {creds && (
        <Modal title="รหัสเชื่อมต่อ MQTT (แสดงครั้งเดียว)" onClose={() => setCreds(null)} wide>
          <p className="muted small">บันทึกลงตัวอุปกรณ์ทันที ระบบเก็บเฉพาะ hash จึงเรียกดูซ้ำไม่ได้</p>
          <dl className="kv">
            <dt>host</dt><dd className="mono">{creds.host}</dd>
            <dt>port</dt><dd className="mono">{creds.port} ({creds.tls ? 'TLS' : 'ไม่เข้ารหัส'})</dd>
            <dt>username / clientId</dt><dd className="mono">{creds.username}</dd>
            <dt>password</dt><dd className="mono">{creds.password}</dd>
            <dt>publish</dt><dd className="mono">{creds.publish_topics.join('\n')}</dd>
            <dt>subscribe</dt><dd className="mono">{creds.subscribe_topics.join('\n')}</dd>
          </dl>
          <div className="modal-actions">
            <button className="btn" onClick={() => void navigator.clipboard?.writeText(creds.password)}>คัดลอกรหัสผ่าน</button>
            <button className="btn primary" onClick={() => setCreds(null)}>บันทึกแล้ว</button>
          </div>
        </Modal>
      )}
    </section>
  );
}
