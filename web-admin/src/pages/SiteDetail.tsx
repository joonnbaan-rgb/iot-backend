import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { DeviceGlyph, inferIcon } from '../lib/deviceIcons';
import { KIND_LABEL, ROLE_LABEL, type SiteKind, type SiteRole } from '../lib/types';
import { ErrorBox, PageHead, StatusPill, errMsg, useLoad } from '../components/ui';

const ROLES = Object.keys(ROLE_LABEL) as SiteRole[];

export function SiteDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const sites = useLoad(() => api.sites(), [id]);
  const members = useLoad(() => api.members(id), [id]);
  const devices = useLoad(() => api.devices(), [id]);
  const site = sites.data?.find((s) => s.id === id);
  const isAdmin = site?.my_role === 'admin';

  const [name, setName] = useState<string | null>(null);
  const [kind, setKind] = useState<SiteKind | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<SiteRole>('viewer');
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      await Promise.all([sites.reload(), members.reload()]);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  if (sites.error) return <ErrorBox message={sites.error} />;
  if (!site) return <div className="muted">กำลังโหลด…</div>;
  const siteDevices = (devices.data ?? []).filter((d) => d.site_id === id);

  function addMember(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      await api.addMember(id, { email: email.trim(), role });
      setEmail('');
    });
  }

  return (
    <>
      <PageHead
        title={site.name}
        sub={`${KIND_LABEL[site.kind]}${site.is_personal ? ' · ไซต์ส่วนตัว' : ''} · คุณเป็น${ROLE_LABEL[site.my_role]}`}
        actions={<Link className="btn ghost" to="/sites">← ไซต์ทั้งหมด</Link>}
      />
      <ErrorBox message={error ?? members.error} />

      {isAdmin && (
        <section className="card">
          <h2>ข้อมูลไซต์</h2>
          <form className="form row" onSubmit={(e) => { e.preventDefault(); void run(() => api.updateSite(id, { name: (name ?? site.name).trim(), kind: kind ?? site.kind })); }}>
            <label className="field"><span>ชื่อ</span><input value={name ?? site.name} onChange={(e) => setName(e.target.value)} required maxLength={128} /></label>
            <label className="field">
              <span>ชนิด</span>
              <select value={kind ?? site.kind} onChange={(e) => setKind(e.target.value as SiteKind)}>
                {(Object.keys(KIND_LABEL) as SiteKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </label>
            <button className="btn primary">บันทึก</button>
          </form>
        </section>
      )}

      <section className="card">
        <h2>สมาชิก ({members.data?.length ?? 0})</h2>
        <div className="table-wrap flat">
          <table>
            <thead><tr><th>อีเมล</th><th>บทบาท</th><th /></tr></thead>
            <tbody>
              {(members.data ?? []).map((m) => (
                <tr key={m.user_id}>
                  <td>{m.email}{m.user_id === user?.id ? ' (คุณ)' : ''}</td>
                  <td>
                    {isAdmin ? (
                      <select value={m.role} onChange={(e) => void run(() => api.setMemberRole(id, m.user_id, e.target.value as SiteRole))}>
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                    ) : ROLE_LABEL[m.role]}
                  </td>
                  <td className="right">
                    {(isAdmin || m.user_id === user?.id) && (
                      <button className="btn danger sm" onClick={() => window.confirm(`นำ ${m.email} ออกจากไซต์?`) && void run(() => api.removeMember(id, m.user_id))}>นำออก</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isAdmin && (
          <form className="form row" onSubmit={addMember}>
            <label className="field"><span>เชิญด้วยอีเมล (ต้องสมัครแล้ว)</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label className="field">
              <span>บทบาท</span>
              <select value={role} onChange={(e) => setRole(e.target.value as SiteRole)}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </label>
            <button className="btn primary" disabled={!email.trim()}>เพิ่มสมาชิก</button>
          </form>
        )}
        <p className="muted small">ผู้ดูแล = จัดการได้ทุกอย่าง · ผู้ปฏิบัติงาน = ดูและสั่งงาน · ผู้ชม = ดูอย่างเดียว</p>
      </section>

      <section className="card">
        <h2>อุปกรณ์ในไซต์ ({siteDevices.length})</h2>
        <ul className="feed">
          {siteDevices.map((d) => (
            <li key={d.id}>
              <DeviceGlyph icon={inferIcon(d)} type={d.type} size={20} />
              <Link className="feed-msg" to={`/devices/${d.id}`}>{d.name}</Link>
              <StatusPill status={d.status} />
            </li>
          ))}
        </ul>
        {siteDevices.length === 0 && <div className="muted small">ยังไม่มีอุปกรณ์ในไซต์นี้</div>}
      </section>

      {isAdmin && !site.is_personal && (
        <section className="card">
          <h2>โซนอันตราย</h2>
          <button
            className="btn danger"
            onClick={() => window.confirm('ลบไซต์นี้? (ต้องย้ายอุปกรณ์ออกก่อน)') && void run(async () => { await api.deleteSite(id); nav('/sites'); })}
          >
            ลบไซต์
          </button>
        </section>
      )}
    </>
  );
}
