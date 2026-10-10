import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useSocketEvent } from '../lib/socket';
import { DeviceGlyph, inferIcon } from '../lib/deviceIcons';
import { EVENT_LABEL, type Device, type NotificationLog, type Site } from '../lib/types';
import { timeAgo } from '../lib/format';
import { ErrorBox, PageHead, StatusPill, errMsg } from '../components/ui';

interface StatusEvt { device_id: string; status: string }

export function Dashboard() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [d, s, n] = await Promise.all([api.devices(), api.sites(), api.notifications(8)]);
      setDevices(d);
      setSites(s);
      setLogs(n);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60000); // เผื่อ event ที่พลาด
    return () => clearInterval(t);
  }, [load]);

  useSocketEvent<StatusEvt>('device:status', (p) =>
    setDevices((prev) => prev.map((d) => (d.id === p.device_id ? { ...d, status: p.status as Device['status'] } : d))),
  );
  useSocketEvent<unknown>('shares:changed', () => void load());

  const online = devices.filter((d) => d.status === 'online').length;
  const offline = devices.length - online;
  const byType = { sensor: 0, camera: 0, actuator: 0 } as Record<Device['type'], number>;
  devices.forEach((d) => (byType[d.type] += 1));
  const pct = devices.length ? Math.round((online / devices.length) * 100) : 0;

  return (
    <>
      <PageHead title="ภาพรวม" sub="สถานะอุปกรณ์แบบเรียลไทม์" />
      <ErrorBox message={error} />
      <div className="kpis">
        <div className="kpi"><span>อุปกรณ์ทั้งหมด</span><b>{devices.length}</b></div>
        <div className="kpi good"><span>ออนไลน์</span><b>{online}</b></div>
        <div className={`kpi ${offline ? 'bad' : ''}`}><span>ออฟไลน์</span><b>{offline}</b></div>
        <div className="kpi"><span>ไซต์</span><b>{sites.length}</b></div>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>สุขภาพระบบ</h2>
          <div className="meter" aria-label={`ออนไลน์ ${pct}%`}>
            <div style={{ width: `${pct}%` }} />
          </div>
          <div className="muted small">{pct}% ของอุปกรณ์ออนไลน์</div>
          <div className="types">
            <span>เซนเซอร์ <b>{byType.sensor}</b></span>
            <span>กล้อง <b>{byType.camera}</b></span>
            <span>อุปกรณ์สั่งงาน <b>{byType.actuator}</b></span>
          </div>
        </section>
        <section className="card">
          <h2>แจ้งเตือนล่าสุด</h2>
          {logs.length === 0 && <div className="muted small">ยังไม่มีการแจ้งเตือน</div>}
          <ul className="feed">
            {logs.map((l) => (
              <li key={l.id}>
                <span className={`tag ${l.status}`}>{EVENT_LABEL[l.event_type] ?? l.event_type}</span>
                <span className="feed-msg">{l.message}</span>
                <span className="muted small">{timeAgo(l.created_at)}</span>
              </li>
            ))}
          </ul>
          <Link to="/notifications" className="more">ดูทั้งหมด →</Link>
        </section>
      </div>

      <h2 className="section-title">อุปกรณ์</h2>
      {loading && <div className="muted">กำลังโหลด…</div>}
      <div className="tiles">
        {devices.map((d) => (
          <Link key={d.id} to={`/devices/${d.id}`} className={`tile ${d.status}`}>
            <div className="tile-ico"><DeviceGlyph icon={inferIcon(d)} type={d.type} size={26} /></div>
            <div className="tile-name">{d.name}</div>
            <StatusPill status={d.status} />
            <div className="muted small">{timeAgo(d.last_seen_at)}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
