import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { KIND_LABEL, ROLE_LABEL, type SiteKind } from '../lib/types';
import { Empty, ErrorBox, PageHead, errMsg, useLoad } from '../components/ui';

export function Sites() {
  const sites = useLoad(() => api.sites(), []);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<SiteKind>('home');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createSite({ name: name.trim(), kind });
      setName('');
      await sites.reload();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHead title="ไซต์" sub="พื้นที่ใช้งาน เช่น บ้าน ฟาร์ม โรงงาน พร้อมทีมและบทบาท" />
      <ErrorBox message={sites.error ?? error} />
      <form className="card form row" onSubmit={create}>
        <label className="field"><span>ชื่อไซต์ใหม่</span><input value={name} onChange={(e) => setName(e.target.value)} required maxLength={128} placeholder="เช่น ฟาร์มเมลอนบางไทร" /></label>
        <label className="field">
          <span>ชนิด</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as SiteKind)}>
            {(Object.keys(KIND_LABEL) as SiteKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
        <button className="btn primary" disabled={busy || !name.trim()}>+ สร้างไซต์</button>
      </form>

      <div className="tiles wide">
        {(sites.data ?? []).map((s) => (
          <Link key={s.id} to={`/sites/${s.id}`} className="tile site">
            <div className="tile-name">{s.name}</div>
            <div className="muted small">{KIND_LABEL[s.kind]}{s.is_personal ? ' · ส่วนตัว' : ''}</div>
            <div className="site-meta">
              <span><b className="mono">{s.device_count}</b> อุปกรณ์</span>
              <span><b className="mono">{s.member_count}</b> สมาชิก</span>
            </div>
            <div className="muted small">คุณเป็น{ROLE_LABEL[s.my_role]}</div>
          </Link>
        ))}
      </div>
      {!sites.loading && (sites.data ?? []).length === 0 && <Empty>ยังไม่มีไซต์</Empty>}
    </>
  );
}
