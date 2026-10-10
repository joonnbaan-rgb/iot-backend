import { api } from '../lib/api';
import { EVENT_LABEL } from '../lib/types';
import { fmtDateTime } from '../lib/format';
import { Empty, ErrorBox, PageHead, useLoad } from '../components/ui';

const CHANNEL: Record<string, string> = { app: 'ในแอป', telegram: 'Telegram', line: 'LINE', email: 'อีเมล' };

export function Notifications() {
  const logs = useLoad(() => api.notifications(150), []);
  return (
    <>
      <PageHead
        title="แจ้งเตือน"
        sub="ประวัติการแจ้งเตือน (ตั้งช่องทาง Telegram/LINE/อีเมลได้ในแอปมือถือ: แท็บแจ้งเตือน → ตั้งค่า)"
        actions={<button className="btn ghost" onClick={() => void logs.reload()}>รีเฟรช</button>}
      />
      <ErrorBox message={logs.error} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>เวลา</th><th>เหตุการณ์</th><th>ช่องทาง</th><th>ข้อความ</th><th>สถานะ</th></tr></thead>
          <tbody>
            {(logs.data ?? []).map((l) => (
              <tr key={l.id}>
                <td className="muted nowrap">{fmtDateTime(l.created_at)}</td>
                <td>{EVENT_LABEL[l.event_type] ?? l.event_type}</td>
                <td>{CHANNEL[l.channel] ?? l.channel}</td>
                <td>{l.message}{l.error && <div className="err-line">{l.error}</div>}</td>
                <td><span className={`tag ${l.status}`}>{l.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!logs.loading && (logs.data ?? []).length === 0 && <Empty>ยังไม่มีการแจ้งเตือน</Empty>}
      </div>
    </>
  );
}
