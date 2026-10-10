export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'ไม่เคยส่งข้อมูล';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'เมื่อสักครู่';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} ชม.ที่แล้ว`;
  return `${Math.floor(h / 24)} วันที่แล้ว`;
}

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'medium' });

export const fmtNum = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
