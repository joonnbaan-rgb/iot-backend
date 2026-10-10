import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { InviteCreated, UserRole } from '../lib/types';
import { fmtDateTime } from '../lib/format';
import { ErrorBox, Modal, PageHead, errMsg, useLoad } from '../components/ui';

export function Admin() {
  const { user } = useAuth();
  const users = useLoad(() => api.users(), []);
  const invites = useLoad(() => api.invites(), []);
  const [email, setEmail] = useState('');
  const [days, setDays] = useState(7);
  const [created, setCreated] = useState<InviteCreated | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (user?.role !== 'admin') return <ErrorBox message="หน้านี้สำหรับผู้ดูแลระบบเท่านั้น" />;

  async function createInvite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setCreated(await api.createInvite({ email: email.trim() || undefined, days }));
      setEmail('');
      await invites.reload();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  async function changeRole(id: string, role: UserRole) {
    setError(null);
    try {
      await api.setUserRole(id, role);
      await users.reload();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  return (
    <>
      <PageHead title="ผู้ใช้และใบเชิญ" sub="จัดการบัญชีของระบบ (เฉพาะผู้ดูแลระบบ)" />
      <ErrorBox message={error ?? users.error ?? invites.error} />

      <section className="card">
        <h2>ผู้ใช้ ({users.data?.length ?? 0})</h2>
        <div className="table-wrap flat">
          <table>
            <thead><tr><th>อีเมล</th><th>สิทธิ์ระบบ</th><th>สมัครเมื่อ</th></tr></thead>
            <tbody>
              {(users.data ?? []).map((u) => (
                <tr key={u.id}>
                  <td>{u.email}{u.id === user.id ? ' (คุณ)' : ''}</td>
                  <td>
                    <select value={u.role} disabled={u.id === user.id} onChange={(e) => void changeRole(u.id, e.target.value as UserRole)}>
                      <option value="user">ผู้ใช้</option>
                      <option value="admin">ผู้ดูแลระบบ</option>
                    </select>
                  </td>
                  <td className="muted">{fmtDateTime(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>ใบเชิญสมัครสมาชิก</h2>
        <form className="form row" onSubmit={createInvite}>
          <label className="field"><span>ผูกกับอีเมล (ไม่บังคับ)</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="เว้นว่าง = ใครใช้ก็ได้" /></label>
          <label className="field"><span>อายุ (วัน)</span><input type="number" min={1} max={30} value={days} onChange={(e) => setDays(Math.min(30, Math.max(1, Number(e.target.value) || 7)))} /></label>
          <button className="btn primary">สร้างรหัสเชิญ</button>
        </form>
        <div className="table-wrap flat">
          <table>
            <thead><tr><th>อีเมลที่ผูก</th><th>หมดอายุ</th><th>สถานะ</th><th /></tr></thead>
            <tbody>
              {(invites.data ?? []).map((i) => {
                const expired = new Date(i.expires_at).getTime() < Date.now();
                return (
                  <tr key={i.id}>
                    <td>{i.email ?? '—'}</td>
                    <td className="muted">{fmtDateTime(i.expires_at)}</td>
                    <td>{i.used_at ? <span className="tag sent">ใช้แล้ว</span> : expired ? <span className="tag skipped">หมดอายุ</span> : <span className="tag pending">รอใช้</span>}</td>
                    <td className="right">
                      {!i.used_at && <button className="btn danger sm" onClick={() => void api.deleteInvite(i.id).then(invites.reload).catch((e) => setError(errMsg(e)))}>ยกเลิก</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {created && (
        <Modal title="รหัสเชิญ (แสดงครั้งเดียว)" onClose={() => setCreated(null)}>
          <div className="invite-code mono">{created.code}</div>
          <p className="muted small">
            ส่งรหัสนี้ให้ผู้ที่จะสมัคร{created.email ? ` (ใช้ได้เฉพาะ ${created.email})` : ''} หมดอายุ {fmtDateTime(created.expires_at)}
          </p>
          <div className="modal-actions">
            <button className="btn" onClick={() => void navigator.clipboard?.writeText(created.code)}>คัดลอก</button>
            <button className="btn primary" onClick={() => setCreated(null)}>เสร็จสิ้น</button>
          </div>
        </Modal>
      )}
    </>
  );
}
