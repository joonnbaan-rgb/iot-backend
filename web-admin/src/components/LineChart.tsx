import { useMemo, useState } from 'react';
import { fmtNum } from '../lib/format';

export interface ChartPoint { t: number; v: number }

const W = 720;
const H = 220;
const PAD = { l: 48, r: 14, t: 14, b: 26 };

/** กราฟเส้น SVG เบา ๆ (ไม่พึ่งไลบรารี) เลื่อนเมาส์เพื่อดูค่า */
export function LineChart({ points, unit }: { points: ChartPoint[]; unit?: string | null }) {
  const [hover, setHover] = useState<number | null>(null);

  const g = useMemo(() => {
    if (points.length === 0) return null;
    const ts = points.map((p) => p.t);
    const vs = points.map((p) => p.v);
    const t0 = Math.min(...ts);
    const t1 = Math.max(...ts);
    let v0 = Math.min(...vs);
    let v1 = Math.max(...vs);
    if (v0 === v1) {
      v0 -= 1;
      v1 += 1;
    }
    const padV = (v1 - v0) * 0.08;
    v0 -= padV;
    v1 += padV;
    const x = (t: number) => PAD.l + (t1 === t0 ? (W - PAD.l - PAD.r) / 2 : ((t - t0) / (t1 - t0)) * (W - PAD.l - PAD.r));
    const y = (v: number) => PAD.t + (1 - (v - v0) / (v1 - v0)) * (H - PAD.t - PAD.b);
    const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
    const area = `${path} L${x(t1).toFixed(1)},${H - PAD.b} L${x(t0).toFixed(1)},${H - PAD.b} Z`;
    const ticks = [0, 0.5, 1].map((f) => ({ v: v0 + (v1 - v0) * f, y: y(v0 + (v1 - v0) * f) }));
    return { x, y, path, area, ticks, t0, t1 };
  }, [points]);

  if (!g) return <div className="chart-empty">ยังไม่มีข้อมูลในช่วงเวลานี้</div>;

  const hp = hover != null ? points[hover] : null;
  const fmtT = (t: number) => new Date(t).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    let bd = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs((g as NonNullable<typeof g>).x(p.t) - px);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    setHover(best);
  }

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="กราฟค่าเซนเซอร์">
        <defs>
          <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {g.ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={t.y} y2={t.y} className="grid" />
            <text x={PAD.l - 8} y={t.y + 4} textAnchor="end" className="axis">{fmtNum(t.v)}</text>
          </g>
        ))}
        <text x={PAD.l} y={H - 6} className="axis">{fmtT(g.t0)}</text>
        <text x={W - PAD.r} y={H - 6} textAnchor="end" className="axis">{fmtT(g.t1)}</text>
        <path d={g.area} fill="url(#area)" />
        <path d={g.path} className="line" />
        {hp && (
          <g>
            <line x1={g.x(hp.t)} x2={g.x(hp.t)} y1={PAD.t} y2={H - PAD.b} className="cross" />
            <circle cx={g.x(hp.t)} cy={g.y(hp.v)} r={4} className="hover-dot" />
          </g>
        )}
      </svg>
      <div className="chart-readout">
        {hp ? (
          <>
            <b>{fmtNum(hp.v)}</b> {unit ?? ''} <span>{fmtT(hp.t)}</span>
          </>
        ) : (
          <span>เลื่อนเมาส์บนกราฟเพื่อดูค่า · {points.length} จุด</span>
        )}
      </div>
    </div>
  );
}
