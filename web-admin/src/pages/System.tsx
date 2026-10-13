import { API_BASE } from '../lib/api';
import { useAuth } from '../lib/auth';
import { ErrorBox, PageHead } from '../components/ui';

interface SystemLink {
  key: string;
  name: string;
  desc: string;
  url: string;
  hint?: string; // ข้อมูลล็อกอินค่าเริ่มต้น (แสดงเฉพาะลิงก์ที่มาจากค่าเริ่มต้นของเครื่องพัฒนา)
}

const env = import.meta.env as Record<string, string | undefined>;

/** เปิดจากเครื่องตัวเอง/วง LAN (ตอนพัฒนา) -> ใช้พอร์ตมาตรฐานของ docker-compose เป็นค่าเริ่มต้น */
function isLocalHost(h: string): boolean {
  return h === 'localhost' || h === '127.0.0.1' || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
}

/**
 * รายการลิงก์ไปหน้าระบบ backend:
 *  - ตั้งค่าเองด้วย VITE_LINK_<KEY> ตอน build (ค่าว่างหรือไม่ตั้ง = ซ่อน เมื่อไม่ได้เปิดจากเครื่องพัฒนา)
 *  - ตอนพัฒนา (localhost / IP วงใน) ถ้าไม่ตั้งจะใช้พอร์ตเริ่มต้นของ docker-compose
 */
function buildLinks(): SystemLink[] {
  const host = window.location.hostname;
  const dev = isLocalHost(host);
  const def = (port: number, path = '') => (dev ? `http://${host}:${port}${path}` : '');
  const pick = (key: string, fallback: string): { url: string; usedDefault: boolean } => {
    const v = env[`VITE_LINK_${key}`];
    return v !== undefined && v !== '' ? { url: v, usedDefault: false } : { url: fallback, usedDefault: true };
  };
  const defs: { key: string; name: string; desc: string; fallback: string; hint?: string }[] = [
    { key: 'GRAFANA', name: 'Grafana', desc: 'แดชบอร์ดสถานะระบบ (CPU, MQTT, ข้อความ telemetry, ความหน่วง)', fallback: def(3001), hint: 'dev: admin / admin123' },
    { key: 'PROMETHEUS', name: 'Prometheus', desc: 'ดู metrics ดิบ, สถานะ scrape และกฎแจ้งเตือน (Alerts)', fallback: def(9090, '/alerts') },
    { key: 'ALERTMANAGER', name: 'Alertmanager', desc: 'แจ้งเตือนที่กำลังยิง/ถูกส่งต่อ และการปิดเสียงชั่วคราว (Silences)', fallback: def(9093) },
    { key: 'EMQX', name: 'EMQX Dashboard', desc: 'MQTT broker: อุปกรณ์ที่เชื่อมต่อ, subscription, ข้อความ', fallback: def(18083), hint: 'dev: admin / public' },
    { key: 'MINIO', name: 'MinIO Console', desc: 'ไฟล์คลิปกล้องที่บันทึกไว้', fallback: def(9001), hint: 'dev: minioadmin / minioadmin123' },
    { key: 'MEDIAMTX', name: 'MediaMTX API', desc: 'สถานะสตรีมกล้อง (paths) แบบ JSON', fallback: def(9997, '/v3/paths/list') },
  ];
  const out: SystemLink[] = defs.map((d) => {
    const p = pick(d.key, d.fallback);
    return { key: d.key, name: d.name, desc: d.desc, url: p.url, hint: p.usedDefault ? d.hint : undefined };
  });
  out.unshift({ key: 'API', name: 'Backend API', desc: 'ตรวจสุขภาพ (health) ของ backend', url: `${API_BASE.replace(/\/$/, '')}/health` });
  return out.filter((l) => l.url !== '');
}

export function System() {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <ErrorBox message="หน้านี้สำหรับผู้ดูแลระบบเท่านั้น" />;
  const links = buildLinks();

  return (
    <>
      <PageHead title="ระบบ backend" sub="ทางลัดไปหน้าเฝ้าระวังและจัดการระบบ (เปิดในแท็บใหม่ ต้องล็อกอินแต่ละระบบแยกกัน)" />
      <div className="link-grid">
        {links.map((l) => (
          <a key={l.key} className="card link-card" href={l.url} target="_blank" rel="noreferrer">
            <h2>{l.name} <span aria-hidden>↗</span></h2>
            <p className="muted">{l.desc}</p>
            <div className="mono small muted">{l.url}</div>
            {l.hint && <div className="small muted">{l.hint}</div>}
          </a>
        ))}
      </div>
      <p className="muted small">
        บนเซิร์ฟเวอร์จริงจะแสดงเฉพาะลิงก์ที่ตั้งไว้ตอน build (เช่น <span className="mono">VITE_LINK_GRAFANA=https://monitor.โดเมนของคุณ</span>) —
        ระบบอื่นถูกเปิดเฉพาะในเครือข่ายภายใน ไม่เปิดสู่อินเทอร์เน็ต เพื่อความปลอดภัย
      </p>
    </>
  );
}
