import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { errMsg, ErrorBox } from '../components/ui';
import { API_BASE } from '../lib/api';

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login" onSubmit={submit}>
        <div className="login-title">IoT <b>Control Room</b></div>
        <p className="muted">เข้าสู่ระบบเพื่อดูแลอุปกรณ์ ไซต์ และผู้ใช้</p>
        <label className="field">
          <span>อีเมล</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
        </label>
        <label className="field">
          <span>รหัสผ่าน</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        <ErrorBox message={error} />
        <button className="btn primary block" disabled={busy}>{busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</button>
        <div className="login-foot">เซิร์ฟเวอร์: {API_BASE}</div>
      </form>
    </div>
  );
}
