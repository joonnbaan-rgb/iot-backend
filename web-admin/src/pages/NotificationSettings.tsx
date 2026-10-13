import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { EVENT_LABEL } from '../lib/types';
import type { LinkCode, NotificationChannel, NotificationSettingsView } from '../lib/types';
import { ErrorBox, errMsg, useLoad } from '../components/ui';

const TYPE_LABEL: Record<NotificationChannel['type'], string> = { telegram: 'Telegram', line: 'LINE', email: 'อีเมล' };

/** เวลาที่ผูกล่าสุดของช่องทางประเภทหนึ่ง (ใช้ตรวจว่าผูกสำเร็จ แม้เป็นการผูกซ้ำช่องเดิม) */
function latestLinked(v: NotificationSettingsView, type: string): number {
  return Math.max(0, ...v.channels.filter((c) => c.type === type).map((c) => (c.linked_at ? Date.parse(c.linked_at) : 0)));
}

export function NotificationSettings() {
  const settings = useLoad(() => api.notificationSettings(), []);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<(LinkCode & { type: 'telegram' | 'line' }) | null>(null);
  const [qStart, setQStart] = useState('');
  const [qEnd, setQEnd] = useState('');
  const baseline = useRef<{ count: number; latest: number }>({ count: 0, latest: 0 });

  const s = settings.data;

  // ซิงก์ช่องกรอกช่วงเงียบเมื่อโหลดข้อมูลมา
  useEffect(() => {
    if (!s) return;
    setQStart(s.quiet_start == null ? '' : String(s.quiet_start));
    setQEnd(s.quiet_end == null ? '' : String(s.quiet_end));
  }, [s?.quiet_start, s?.quiet_end]); // eslint-disable-line react-hooks/exhaustive-deps

  // ระหว่างรอผูก Telegram/LINE: ถามสถานะซ้ำทุก 3 วินาที จนกว่าจะผูกสำเร็จหรือรหัสหมดอายุ
  useEffect(() => {
    if (!link) return;
    const t = setInterval(async () => {
      if (new Date(link.expires_at).getTime() < Date.now()) {
        setLink(null);
        setError('รหัสหมดอายุแล้ว กรุณาขอรหัสใหม่');
        return;
      }
      try {
        const v = await api.notificationSettings();
        const count = v.channels.filter((c) => c.type === link.type).length;
        if (count > baseline.current.count || latestLinked(v, link.type) > baseline.current.latest) {
          settings.setData(v);
          setLink(null);
          setInfo(`เชื่อมต่อ ${TYPE_LABEL[link.type]} เรียบร้อยแล้ว`);
        }
      } catch {
        /* ลองใหม่รอบหน้า */
      }
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link?.code]);

  async function run(fn: () => Promise<unknown>, okMsg?: string) {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await fn();
      if (okMsg) setInfo(okMsg);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function startLink(type: 'telegram' | 'line') {
    if (!s) return;
    await run(async () => {
      baseline.current = {
        count: s.channels.filter((c) => c.type === type).length,
        latest: latestLinked(s, type),
      };
      setLink({ ...(await api.linkCode(type)), type });
    });
  }

  async function toggleEvent(ev: string) {
    if (!s) return;
    const next = s.events.includes(ev) ? s.events.filter((e) => e !== ev) : [...s.events, ev];
    await run(async () => settings.setData(await api.saveNotificationSettings({ events: next })));
  }

  async function saveQuiet() {
    const a = qStart.trim();
    const b = qEnd.trim();
    if ((a === '') !== (b === '')) {
      setError('ระบุทั้งเวลาเริ่มและเวลาสิ้นสุด หรือเว้นว่างทั้งคู่เพื่อปิดช่วงเงียบ');
      return;
    }
    const hour = (v: string) => Number(v);
    if (a !== '' && [a, b].some((v) => !Number.isInteger(hour(v)) || hour(v) < 0 || hour(v) > 23)) {
      setError('เวลาต้องเป็นชั่วโมง 0-23');
      return;
    }
    await run(
      async () =>
        settings.setData(
          await api.saveNotificationSettings({
            quiet_start: a === '' ? null : hour(a),
            quiet_end: b === '' ? null : hour(b),
          }),
        ),
      'บันทึกช่วงเวลาเงียบแล้ว',
    );
  }

  async function sendTest() {
    await run(async () => {
      const res = await api.testNotification();
      if (res.length === 0) {
        setError('ยังไม่มีช่องทางที่เปิดอยู่ให้ทดสอบ');
        return;
      }
      const failed = res.filter((r) => !r.ok);
      if (failed.length === 0) setInfo(`ส่งทดสอบสำเร็จ ${res.length} ช่องทาง`);
      else setError(failed.map((r) => `${r.channel} (${r.target}): ${r.error ?? 'ไม่สำเร็จ'}`).join('\n'));
    });
  }

  if (!s) return <>{settings.error ? <ErrorBox message={settings.error} /> : <div className="muted">กำลังโหลด…</div>}</>;

  // หนึ่งบัญชีต่อหนึ่งประเภทช่องทาง: เพิ่มแล้วจะเพิ่มซ้ำไม่ได้ (ลบก่อนหากต้องการผูกใหม่)
  const allowed = (type: NotificationChannel['type']) => (s.allowed_types ?? ['telegram', 'line', 'email']).includes(type);
  const added = (type: NotificationChannel['type']) => s.channels.find((c) => c.type === type);

  return (
    <div className="stack">
      <ErrorBox message={error ?? settings.error} />
      {info && <div className="info-box">{info}</div>}

      <div className="card">
        <div className="card-head">
          <h2>ช่องทางของฉัน</h2>
          <button className="btn sm" disabled={busy || s.channels.length === 0} onClick={() => void sendTest()}>ส่งทดสอบ</button>
        </div>
        <p className="muted">ช่องทางเหล่านี้รับการแจ้งเตือนของบัญชีที่ล็อกอินอยู่ (admin ยังรับแจ้งเตือนระบบ เช่น backend ล่ม ด้วย)</p>

        <div className="table-wrap flat">
          <table>
            <thead><tr><th>ช่องทาง</th><th>ปลายทาง</th><th>สถานะ</th><th /></tr></thead>
            <tbody>
              {s.channels.map((c) => (
                <tr key={c.id}>
                  <td>{TYPE_LABEL[c.type]}</td>
                  <td>{c.label}</td>
                  <td>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={c.enabled}
                        disabled={busy}
                        onChange={() => void run(async () => { await api.setChannelEnabled(c.id, !c.enabled); settings.setData(await api.notificationSettings()); })}
                      />
                      <span>{c.enabled ? 'เปิด' : 'ปิด'}</span>
                    </label>
                  </td>
                  <td className="right">
                    <button
                      className="btn danger sm"
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm(`ลบช่องทาง ${TYPE_LABEL[c.type]} (${c.label})?`)) return;
                        void run(async () => { await api.removeChannel(c.id); settings.setData(await api.notificationSettings()); });
                      }}
                    >
                      ลบ
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {s.channels.length === 0 && <div className="empty">ยังไม่ได้ผูกช่องทางใด</div>}
        </div>

        <div className="row-btns">
          {added('telegram') ? (
            <span className="muted">✓ เพิ่ม Telegram แล้ว ({added('telegram')?.label})</span>
          ) : (
            <button className="btn" disabled={busy || !s.providers.telegram || !allowed('telegram')} title={allowed('telegram') ? undefined : 'แพ็กเกจของคุณใช้ช่องทางนี้ไม่ได้'} onClick={() => void startLink('telegram')}>+ Telegram</button>
          )}
          {added('line') ? (
            <span className="muted">✓ เพิ่ม LINE แล้ว ({added('line')?.label})</span>
          ) : (
            <button className="btn" disabled={busy || !s.providers.line || !allowed('line')} title={allowed('line') ? undefined : 'แพ็กเกจของคุณใช้ช่องทางนี้ไม่ได้'} onClick={() => void startLink('line')}>+ LINE</button>
          )}
          {added('email') ? (
            <span className="muted">✓ เพิ่มช่องทางอีเมลแล้ว ({added('email')?.label})</span>
          ) : (
            <button
              className="btn"
              disabled={busy || !s.providers.email || !allowed('email')}
              title={allowed('email') ? `ส่งไปที่ ${s.account_email ?? 'อีเมลของบัญชี'}` : 'แพ็กเกจของคุณใช้ช่องทางนี้ไม่ได้'}
              onClick={() => void run(async () => settings.setData(await api.addEmailChannel()), 'เพิ่มช่องทางอีเมลแล้ว')}
            >
              + อีเมล
            </button>
          )}
        </div>
        {(['telegram', 'line', 'email'] as const).some((t) => !allowed(t)) && (
          <p className="muted small">
            แพ็กเกจปัจจุบันใช้ไม่ได้:{(['telegram', 'line', 'email'] as const).filter((t) => !allowed(t)).map((t) => ` ${TYPE_LABEL[t]}`).join(',')} (อัปเกรดแพ็กเกจหรือติดต่อผู้ดูแลระบบ)
          </p>
        )}
        {(!s.providers.telegram || !s.providers.line || !s.providers.email) && (
          <p className="muted small">
            ปุ่มที่กดไม่ได้ = เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า:
            {!s.providers.telegram && ' Telegram (TELEGRAM_BOT_TOKEN)'}
            {!s.providers.line && ' LINE (LINE_CHANNEL_ACCESS_TOKEN)'}
            {!s.providers.email && ' อีเมล (RESEND_API_KEY, EMAIL_FROM)'}
          </p>
        )}

        {link && (
          <div className="link-box">
            <div className="muted">รหัสเชื่อมต่อ {TYPE_LABEL[link.type]}</div>
            <div className="link-code">{link.code}</div>
            <div className="muted">{link.instructions}</div>
            {link.open_url && (
              <p><a className="btn sm" href={link.open_url} target="_blank" rel="noreferrer">เปิด {TYPE_LABEL[link.type]}</a></p>
            )}
            <div className="muted">กำลังรอการเชื่อมต่อ… (ตรวจสอบอัตโนมัติทุก 3 วินาที)</div>
            <button className="btn ghost sm" onClick={() => setLink(null)}>ยกเลิก</button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head"><h2>เหตุการณ์ที่ต้องการรับ</h2></div>
        <div className="row-btns">
          {s.all_events.map((ev) => (
            <label key={ev} className="check">
              <input type="checkbox" checked={s.events.includes(ev)} disabled={busy} onChange={() => void toggleEvent(ev)} />
              <span>{EVENT_LABEL[ev] ?? ev}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>ช่วงเวลาเงียบ</h2></div>
        <p className="muted">ไม่ส่งแจ้งเตือนช่วงเวลานี้ (ตามเวลาของเซิร์ฟเวอร์ โซนไทยโดยค่าเริ่มต้น) แจ้งเตือนวิกฤตของระบบจะส่งเสมอ เว้นว่างทั้งคู่ = ปิด</p>
        <div className="form row">
          <label className="field"><span>เริ่ม (ชั่วโมง 0-23)</span><input type="number" min={0} max={23} value={qStart} onChange={(e) => setQStart(e.target.value)} placeholder="เช่น 22" /></label>
          <label className="field"><span>สิ้นสุด (ชั่วโมง 0-23)</span><input type="number" min={0} max={23} value={qEnd} onChange={(e) => setQEnd(e.target.value)} placeholder="เช่น 7" /></label>
          <button className="btn primary" disabled={busy} onClick={() => void saveQuiet()}>บันทึก</button>
        </div>
      </div>
    </div>
  );
}
