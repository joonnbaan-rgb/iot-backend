import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const NAV = [
  { to: '/', label: 'ภาพรวม', end: true },
  { to: '/devices', label: 'อุปกรณ์' },
  { to: '/sites', label: 'ไซต์' },
  { to: '/notifications', label: 'แจ้งเตือน' },
];

export function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12a7 7 0 0 1 14 0" /><path d="M8.5 12a3.5 3.5 0 0 1 7 0" /><circle cx="12" cy="12" r="1.2" fill="currentColor" />
              <path d="M12 16v5" />
            </svg>
          </span>
          <span>IoT <b>Control Room</b></span>
        </div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'nav on' : 'nav')}>
              {n.label}
            </NavLink>
          ))}
          {user?.role === 'admin' && (
            <NavLink to="/admin" className={({ isActive }) => (isActive ? 'nav on' : 'nav')}>
              ผู้ใช้และใบเชิญ
            </NavLink>
          )}
        </nav>
        <div className="side-foot">
          <div className="who" title={user?.email}>{user?.email}</div>
          <div className="role">{user?.role === 'admin' ? 'ผู้ดูแลระบบ' : 'ผู้ใช้'}</div>
          <button className="btn ghost" onClick={() => void logout()}>ออกจากระบบ</button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
