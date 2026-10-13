import { useEffect, useMemo, useState } from 'react';
import { INTEGRATION_LABEL, type DeviceProfile, type MqttCredentials } from '../lib/types';
import { fieldDefaults, renderTemplate, systemVars } from '../lib/profile';

/** แสดงคู่มือตั้งค่าตามรุ่น: ช่องกรอก -> RTSP URL / ขั้นตอน / โค้ดตัวอย่างที่เติมค่าให้แล้ว */
export function ProfileGuide({
  profile,
  deviceId,
  creds,
  rtspOnly,
  onUseRtsp,
}: {
  profile: DeviceProfile;
  deviceId?: string;
  creds?: MqttCredentials | null;
  rtspOnly?: boolean;
  onUseRtsp?: (url: string) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => fieldDefaults(profile));
  const [variant, setVariant] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    setValues(fieldDefaults(profile));
    setVariant(0);
  }, [profile.id]);

  const vars = useMemo(() => ({ ...systemVars(deviceId, creds ?? null), ...values }), [deviceId, creds, values]);
  const rtsp = profile.rtsp_templates[variant];
  const rtspUrl = rtsp ? renderTemplate(rtsp.url, vars) : '';

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* คัดลอกไม่ได้ ผู้ใช้เลือกข้อความเองได้ */
    }
  }

  return (
    <div className="profile-guide">
      <div className="muted small">
        {profile.vendor} · {INTEGRATION_LABEL[profile.integration]}
        {profile.source === 'custom' ? ' · โปรไฟล์เพิ่มเอง' : ''}
      </div>
      {profile.description && <p className="small">{profile.description}</p>}
      {profile.integration === 'planned' && <div className="info-box">รุ่นนี้ยังรองรับไม่เต็มรูปแบบ — อ่านหมายเหตุด้านล่าง</div>}

      {profile.fields.length > 0 && (
        <div className="form row">
          {profile.fields.map((f) => (
            <label key={f.key} className="field">
              <span>{f.label}</span>
              <input
                type={f.secret ? 'password' : 'text'}
                value={values[f.key] ?? ''}
                placeholder={f.placeholder}
                autoComplete="off"
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
            </label>
          ))}
        </div>
      )}

      {profile.rtsp_templates.length > 0 && (
        <div className="subsec">
          <h3>RTSP URL</h3>
          <div className="row-btns">
            <select value={variant} onChange={(e) => setVariant(Number(e.target.value))}>
              {profile.rtsp_templates.map((t, i) => <option key={t.label} value={i}>{t.label}</option>)}
            </select>
            <button type="button" className="btn sm" onClick={() => void copy('rtsp', rtspUrl)}>{copied === 'rtsp' ? 'คัดลอกแล้ว' : 'คัดลอก'}</button>
            {onUseRtsp && <button type="button" className="btn primary sm" onClick={() => onUseRtsp(rtspUrl)}>ใช้ URL นี้</button>}
          </div>
          <pre className="code">{rtspUrl}</pre>
        </div>
      )}

      {!rtspOnly && profile.steps.length > 0 && (
        <div className="subsec">
          <h3>ขั้นตอนตั้งค่า</h3>
          <ol className="steps">
            {profile.steps.map((s, i) => <li key={i}>{renderTemplate(s, vars)}</li>)}
          </ol>
        </div>
      )}

      {!rtspOnly && profile.snippets.map((s, i) => {
        const code = renderTemplate(s.code, vars);
        return (
          <div className="subsec" key={s.title + i}>
            <div className="card-head">
              <h3>{s.title}</h3>
              <button type="button" className="btn sm" onClick={() => void copy(`s${i}`, code)}>{copied === `s${i}` ? 'คัดลอกแล้ว' : 'คัดลอกโค้ด'}</button>
            </div>
            <pre className="code">{code}</pre>
          </div>
        );
      })}

      {profile.notes && <p className="muted small">หมายเหตุ: {profile.notes}</p>}
      {profile.links.length > 0 && (
        <p className="small">
          {profile.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer" style={{ marginRight: 12 }}>{l.title} ↗</a>)}
        </p>
      )}
      {!rtspOnly && profile.protocol === 'mqtt' && !creds && (
        <p className="muted small">ค่า &lt;mqtt_host&gt; / &lt;mqtt_password&gt; จะถูกเติมให้อัตโนมัติหลังกด "ออกรหัสเชื่อมต่อ" ในหน้านี้</p>
      )}
    </div>
  );
}
