import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useSocketEvent } from '../lib/socket';
import { DeviceGlyph, inferIcon } from '../lib/deviceIcons';
import { TYPE_LABEL, type Device, type DeviceType } from '../lib/types';
import { timeAgo } from '../lib/format';
import { Empty, ErrorBox, Modal, PageHead, StatusPill, errMsg, useLoad } from '../components/ui';

export function Devices() {
  const nav = useNavigate();
  const devs = useLoad(() => api.devices(), []);
  const sites = useLoad(() => api.sites(), []);
  const [q, setQ] = useState('');
  const [site, setSite] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [adding, setAdding] = useState(false);

  useSocketEvent<{ device_id: string; status: string }>('device:status', (p) =>
    devs.setData((prev) => (prev ? prev.map((d) => (d.id === p.device_id ? { ...d, status: p.status as Device['status'] } : d)) : prev)),
  );

  const siteName = useMemo(() => new Map((sites.data ?? []).map((s) => [s.id, s.name])), [sites.data]);
  const rows = (devs.data ?? []).filter(
    (d) =>
      (!q || d.name.toLowerCase().includes(q.toLowerCase()) || (d.location ?? '').toLowerCase().includes(q.toLowerCase())) &&
      (!site || d.site_id === site) &&
      (!type || d.type === type) &&
      (!status || d.status === status),
  );

  return (
    <>
      <PageHead
        title="อุปกรณ์"
        sub={`${rows.length} จาก ${devs.data?.length ?? 0} เครื่อง`}
        actions={<button className="btn primary" onClick={() => setAdding(true)}>+ เพิ่มอุปกรณ์</button>}
      />
      <ErrorBox message={devs.error} />
      <div className="filters">
        <input placeholder="ค้นหาชื่อหรือตำแหน่ง" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={site} onChange={(e) => setSite(e.target.value)}>
          <option value="">ทุกไซต์</option>
          {(sites.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">ทุกประเภท</option>
          {(Object.keys(TYPE_LABEL) as DeviceType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          <option value="online">ออนไลน์</option>
          <option value="offline">ออฟไลน์</option>
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>อุปกรณ์</th><th>ประเภท</th><th>ไซต์</th><th>สถานะ</th><th>ข้อมูลล่าสุด</th></tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="click" onClick={() => nav(`/devices/${d.id}`)}>
                <td>
                  <div className="cell-dev">
                    <DeviceGlyph icon={inferIcon(d)} type={d.type} size={22} />
                    <div>
                      <Link to={`/devices/${d.id}`} onClick={(e) => e.stopPropagation()}>{d.name}</Link>
                      {d.location && <div className="muted small">{d.location}</div>}
                    </div>
                  </div>
                </td>
                <td>{TYPE_LABEL[d.type]}</td>
                <td>{d.site_id ? siteName.get(d.site_id) ?? '—' : '—'}</td>
                <td><StatusPill status={d.status} /></td>
                <td className="muted">{timeAgo(d.last_seen_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!devs.loading && rows.length === 0 && <Empty>ไม่พบอุปกรณ์</Empty>}
      </div>

      {adding && (
        <AddDevice
          sites={(sites.data ?? []).filter((s) => s.my_role === 'admin')}
          onClose={() => setAdding(false)}
          onDone={(d) => {
            setAdding(false);
            nav(`/devices/${d.id}`);
          }}
        />
      )}
    </>
  );
}

function AddDevice({ sites, onClose, onDone }: { sites: { id: string; name: string }[]; onClose: () => void; onDone: (d: Device) => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<DeviceType>('sensor');
  const [location, setLocation] = useState('');
  const [rtsp, setRtsp] = useState('');
  const [siteId, setSiteId] = useState(sites[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(
        await api.createDevice({
          name: name.trim(),
          type,
          location: location.trim() || undefined,
          rtsp_url: type === 'camera' && rtsp.trim() ? rtsp.trim() : undefined,
          site_id: siteId || undefined,
        }),
      );
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  return (
    <Modal title="เพิ่มอุปกรณ์" onClose={onClose}>
      <form onSubmit={submit} className="form">
        <label className="field"><span>ชื่ออุปกรณ์</span><input value={name} onChange={(e) => setName(e.target.value)} required maxLength={128} autoFocus /></label>
        <label className="field">
          <span>ประเภท</span>
          <select value={type} onChange={(e) => setType(e.target.value as DeviceType)}>
            {(Object.keys(TYPE_LABEL) as DeviceType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </label>
        {sites.length > 0 && (
          <label className="field">
            <span>ไซต์</span>
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        )}
        <label className="field"><span>ตำแหน่งที่ติดตั้ง (ไม่บังคับ)</span><input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={128} /></label>
        {type === 'camera' && (
          <label className="field"><span>RTSP URL ของกล้อง (ไม่บังคับ)</span><input value={rtsp} onChange={(e) => setRtsp(e.target.value)} placeholder="rtsp://user:pass@192.168.1.50:554/stream1" /></label>
        )}
        <ErrorBox message={error} />
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>ยกเลิก</button>
          <button className="btn primary" disabled={busy || !name.trim()}>{busy ? 'กำลังบันทึก…' : 'เพิ่มอุปกรณ์'}</button>
        </div>
      </form>
    </Modal>
  );
}
