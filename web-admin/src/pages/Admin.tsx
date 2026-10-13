import { useState, type FormEvent } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { TYPE_LABEL, type DeviceType, type Plan, type InviteCreated, type UserDevice, type UserRole, type UserRow } from '../lib/types';
import { fmtDateTime } from '../lib/format';
import { ErrorBox, Modal, PageHead, errMsg, useLoad } from '../components/ui';

export function Admin() {
  const { user } = useAuth();
  const users = useLoad(() => api.users(), []);
  const invites = useLoad(() => api.invites(), []);
  const plans = useLoad(() => api.plans(), []);
  const [email, setEmail] = useState('');
  const [days, setDays] = useState(7);
  const [created, setCreated] = useState<InviteCreated | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [managing, setManaging] = useState<UserRow | null>(null);

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
            <thead><tr><th>อีเมล</th><th>สิทธิ์ระบบ</th><th>สถานะ</th><th>แพ็กเกจ</th><th>อุปกรณ์</th><th>ไซต์</th><th>เข้าใช้ล่าสุด</th><th>สมัครเมื่อ</th><th /></tr></thead>
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
                  <td>{u.status === 'suspended' ? <span className="tag skipped">ระงับ</span> : <span className="tag sent">ใช้งาน</span>}</td>
                  <td>
                    {u.role === 'admin' ? <span className="muted">ไม่จำกัด</span> : (
                      <>
                        {planName(plans.data, u.plan_id)}
                        {u.plan_expires_at && (
                          <div className={isExpired(u.plan_expires_at) ? 'muted danger-text' : 'muted'}>
                            {isExpired(u.plan_expires_at) ? 'หมดอายุแล้ว ' : 'หมดอายุ '}{fmtDateTime(u.plan_expires_at)}
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  <td className="mono">{u.device_count}{u.role === 'admin' ? '' : ` / ${u.device_quota ?? 'ตามแพ็กเกจ'}`}</td>
                  <td className="mono">{u.site_count}{u.role === 'admin' ? '' : ` / ${u.site_quota ?? 'ตามแพ็กเกจ'}`}</td>
                  <td className="muted">{u.last_login_at ? fmtDateTime(u.last_login_at) : '—'}</td>
                  <td className="muted">{fmtDateTime(u.created_at)}</td>
                  <td className="right"><button className="btn sm" onClick={() => setManaging(u)}>จัดการ</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <PlansCard plans={plans.data ?? []} onChanged={() => plans.reload()} />

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

      {managing && (
        <UserManageModal
          target={managing}
          isSelf={managing.id === user.id}
          onClose={() => setManaging(null)}
          onChanged={async () => { await users.reload(); }}
        />
      )}

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

const isExpired = (iso: string) => new Date(iso).getTime() < Date.now();
const planName = (plans: Plan[] | null, id: string) => plans?.find((p) => p.id === id)?.name ?? id;

/** yyyy-mm-dd ตามเวลาเครื่อง สำหรับช่อง input type=date */
function toDateInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** ต่ออายุจากวันหมดอายุเดิม (ถ้ายังไม่หมด) ไม่เช่นนั้นนับจากวันนี้ */
function extendFrom(current: string, days: number): string {
  const base = current && new Date(`${current}T23:59:59`).getTime() > Date.now() ? new Date(`${current}T12:00:00`) : new Date();
  base.setDate(base.getDate() + days);
  return toDateInput(base.toISOString());
}

const CHANNELS: { id: string; label: string }[] = [
  { id: 'telegram', label: 'Telegram' },
  { id: 'line', label: 'LINE' },
  { id: 'email', label: 'อีเมล' },
];

function PlansCard({ plans, onChanged }: { plans: Plan[]; onChanged: () => Promise<void> }) {
  const [edit, setEdit] = useState<Record<string, Plan>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const cur = (p: Plan) => edit[p.id] ?? p;
  const set = (p: Plan, patch: Partial<Plan>) => setEdit({ ...edit, [p.id]: { ...cur(p), ...patch } });
  const int = (v: string) => Math.max(0, Math.floor(Number(v)) || 0);

  async function save(p: Plan) {
    const e = cur(p);
    setBusy(p.id);
    setError(null);
    try {
      await api.updatePlan(p.id, {
        name: e.name, device_quota: e.device_quota, site_quota: e.site_quota, camera_quota: e.camera_quota,
        recording_enabled: e.recording_enabled, notification_types: e.notification_types, retention_days: e.retention_days,
      });
      const next = { ...edit };
      delete next[p.id];
      setEdit(next);
      await onChanged();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="card">
      <h2>แพ็กเกจสมาชิก</h2>
      <p className="muted">กำหนดสิทธิ์ของแต่ละแพ็กเกจ ผู้ใช้ที่แพ็กเกจหมดอายุจะใช้สิทธิ์ของ Free (ข้อมูลเดิมไม่ถูกลบ แต่เพิ่มของใหม่เกินโควตาไม่ได้)</p>
      <ErrorBox message={error} />
      <div className="table-wrap flat">
        <table>
          <thead><tr><th>แพ็กเกจ</th><th>อุปกรณ์</th><th>ไซต์</th><th>กล้อง</th><th>บันทึกคลิป</th><th>ช่องทางแจ้งเตือน</th><th>เก็บข้อมูลเซนเซอร์ (วัน)</th><th /></tr></thead>
          <tbody>
            {plans.map((p) => {
              const e = cur(p);
              const dirty = !!edit[p.id];
              return (
                <tr key={p.id}>
                  <td><input value={e.name} onChange={(ev) => set(p, { name: ev.target.value })} style={{ width: 110 }} /></td>
                  <td><input type="number" min={0} value={e.device_quota} onChange={(ev) => set(p, { device_quota: int(ev.target.value) })} style={{ width: 70 }} /></td>
                  <td><input type="number" min={0} value={e.site_quota} onChange={(ev) => set(p, { site_quota: int(ev.target.value) })} style={{ width: 70 }} /></td>
                  <td><input type="number" min={0} value={e.camera_quota} onChange={(ev) => set(p, { camera_quota: int(ev.target.value) })} style={{ width: 70 }} /></td>
                  <td>
                    <label className="check"><input type="checkbox" checked={e.recording_enabled} onChange={(ev) => set(p, { recording_enabled: ev.target.checked })} /><span>{e.recording_enabled ? 'ได้' : 'ไม่ได้'}</span></label>
                  </td>
                  <td>
                    <div className="row-btns">
                      {CHANNELS.map((c) => (
                        <label key={c.id} className="check">
                          <input
                            type="checkbox"
                            checked={e.notification_types.includes(c.id)}
                            onChange={(ev) => set(p, { notification_types: ev.target.checked ? [...e.notification_types, c.id] : e.notification_types.filter((x) => x !== c.id) })}
                          />
                          <span>{c.label}</span>
                        </label>
                      ))}
                    </div>
                  </td>
                  <td>
                    <input
                      type="number" min={1} placeholder="ไม่จำกัด" value={e.retention_days ?? ''}
                      onChange={(ev) => set(p, { retention_days: ev.target.value.trim() === '' ? null : Math.max(1, int(ev.target.value)) })}
                      style={{ width: 90 }}
                    />
                  </td>
                  <td className="right"><button className="btn primary sm" disabled={!dirty || busy === p.id} onClick={() => void save(p)}>บันทึก</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UserManageModal({ target, isSelf, onClose, onChanged }: {
  target: UserRow; isSelf: boolean; onClose: () => void; onChanged: () => Promise<void>;
}) {
  const devices = useLoad(() => api.userDevices(target.id), [target.id]);
  const [devQuota, setDevQuota] = useState(target.device_quota == null ? '' : String(target.device_quota));
  const [siteQuota, setSiteQuota] = useState(target.site_quota == null ? '' : String(target.site_quota));
  const [status, setStatus] = useState(target.status);
  const allPlans = useLoad(() => api.plans(), []);
  const [planId, setPlanId] = useState(target.plan_id);
  const [expires, setExpires] = useState(target.plan_expires_at ? toDateInput(target.plan_expires_at) : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<DeviceType>('sensor');
  const [moveTo, setMoveTo] = useState<Record<string, string>>({});
  const [delMode, setDelMode] = useState<'delete' | 'transfer'>('transfer');
  const [confirmEmail, setConfirmEmail] = useState('');

  async function removeUser() {
    setBusy(true);
    setError(null);
    try {
      const hasDevices = (devices.data?.length ?? 0) > 0;
      const r = await api.deleteUser(target.id, hasDevices ? delMode : undefined);
      window.alert(`ลบ ${r.deleted_user} แล้ว (อุปกรณ์ลบ ${r.devices_deleted}, โอน ${r.devices_transferred}, ไซต์ที่โอนต่อ ${r.sites_reassigned})`);
      await onChanged();
      onClose();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const num = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.floor(Number(v)) || 0));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.updateUser(target.id, {
        device_quota: num(devQuota),
        site_quota: num(siteQuota),
        plan_id: planId,
        plan_expires_at: expires === '' ? null : new Date(`${expires}T23:59:59`).toISOString(),
        status,
      });
      await onChanged();
      onClose();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function addDevice(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.createDevice({ name: name.trim(), type, owner_id: target.id });
      setName('');
      await devices.reload();
      await onChanged();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  async function transfer(d: UserDevice) {
    const email = (moveTo[d.id] ?? '').trim();
    if (!email || !window.confirm(`โอน "${d.name}" ให้ ${email}?`)) return;
    setError(null);
    try {
      await api.transferDevice(d.id, email);
      await devices.reload();
      await onChanged();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  async function remove(d: UserDevice) {
    if (!window.confirm(`ลบ "${d.name}" พร้อมข้อมูลทั้งหมด? ย้อนกลับไม่ได้`)) return;
    setError(null);
    try {
      await api.deleteDevice(d.id);
      await devices.reload();
      await onChanged();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  return (
    <Modal title={`จัดการผู้ใช้: ${target.email}`} onClose={onClose} wide>
      <ErrorBox message={error ?? devices.error} />
      {target.role !== 'admin' && (
        <div className="form row">
          <label className="field">
            <span>แพ็กเกจ</span>
            <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
              {(allPlans.data ?? []).map((pl) => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>หมดอายุวันที่ (ว่าง = ไม่หมดอายุ)</span>
            <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </label>
          <div className="field">
            <span>ต่ออายุ</span>
            <div className="row-btns">
              <button type="button" className="btn sm" onClick={() => setExpires(extendFrom(expires, 30))}>+30 วัน</button>
              <button type="button" className="btn sm" onClick={() => setExpires(extendFrom(expires, 365))}>+1 ปี</button>
              <button type="button" className="btn ghost sm" onClick={() => setExpires('')}>ไม่หมดอายุ</button>
            </div>
          </div>
        </div>
      )}
      {target.role !== 'admin' && (
        <div className="form row">
          <label className="field"><span>โควตาอุปกรณ์ (ว่าง = ตามแพ็กเกจ)</span><input type="number" min={0} value={devQuota} onChange={(e) => setDevQuota(e.target.value)} /></label>
          <label className="field"><span>โควตาไซต์ (ว่าง = ตามแพ็กเกจ)</span><input type="number" min={0} value={siteQuota} onChange={(e) => setSiteQuota(e.target.value)} /></label>
          <label className="field">
            <span>สถานะบัญชี</span>
            <select value={status} disabled={isSelf} onChange={(e) => setStatus(e.target.value as 'active' | 'suspended')}>
              <option value="active">ใช้งานได้</option>
              <option value="suspended">ระงับ (เข้าสู่ระบบไม่ได้)</option>
            </select>
          </label>
        </div>
      )}

      <div className="subsec">
        <h3>อุปกรณ์ของผู้ใช้นี้ ({devices.data?.length ?? 0})</h3>
        <div className="table-wrap flat">
          <table>
            <thead><tr><th>ชื่อ</th><th>ประเภท</th><th>สถานะ</th><th>โอนให้ (อีเมล)</th><th /></tr></thead>
            <tbody>
              {(devices.data ?? []).map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td className="muted">{TYPE_LABEL[d.type]}</td>
                  <td className="muted">{d.status}</td>
                  <td>
                    <span className="row-btns">
                      <input type="email" value={moveTo[d.id] ?? ''} onChange={(e) => setMoveTo({ ...moveTo, [d.id]: e.target.value })} placeholder="อีเมลเจ้าของใหม่" />
                      <button className="btn sm" disabled={!(moveTo[d.id] ?? '').trim()} onClick={() => void transfer(d)}>โอน</button>
                    </span>
                  </td>
                  <td className="right"><button className="btn danger sm" onClick={() => void remove(d)}>ลบ</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form className="form row" onSubmit={addDevice}>
          <label className="field"><span>เพิ่มอุปกรณ์แทนผู้ใช้</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่ออุปกรณ์" maxLength={128} required /></label>
          <label className="field">
            <span>ประเภท</span>
            <select value={type} onChange={(e) => setType(e.target.value as DeviceType)}>
              {(Object.keys(TYPE_LABEL) as DeviceType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          </label>
          <button className="btn" disabled={!name.trim()}>เพิ่ม</button>
        </form>
      </div>

      {!isSelf && (
        <div className="subsec">
          <h3>โซนอันตราย: ลบผู้ใช้</h3>
          <p className="muted small">
            ลบบัญชีนี้ถาวร (การแชร์ กลุ่ม และช่องทางแจ้งเตือนของเขาจะหายไป) ผู้ใช้ที่ล็อกอินอยู่จะหลุดภายใน 15 นาที
          </p>
          {(devices.data?.length ?? 0) > 0 && (
            <label className="field">
              <span>อุปกรณ์ของผู้ใช้ ({devices.data?.length} เครื่อง)</span>
              <select value={delMode} onChange={(e) => setDelMode(e.target.value as 'delete' | 'transfer')}>
                <option value="transfer">โอนให้ฉัน (เก็บข้อมูลไว้)</option>
                <option value="delete">ลบทิ้งทั้งหมดพร้อมข้อมูล (ย้อนกลับไม่ได้)</option>
              </select>
            </label>
          )}
          <label className="field">
            <span>พิมพ์อีเมล {target.email} เพื่อยืนยัน</span>
            <input value={confirmEmail} onChange={(e) => setConfirmEmail(e.target.value)} placeholder={target.email} />
          </label>
          <button className="btn danger" disabled={busy || confirmEmail.trim().toLowerCase() !== target.email.toLowerCase()} onClick={() => void removeUser()}>
            ลบผู้ใช้นี้
          </button>
        </div>
      )}

      <div className="modal-actions">
        <button className="btn" onClick={onClose}>ปิด</button>
        {target.role !== 'admin' && <button className="btn primary" disabled={busy} onClick={() => void save()}>บันทึกโควตา/สถานะ</button>}
      </div>
    </Modal>
  );
}
