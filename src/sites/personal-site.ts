import { EntityManager } from 'typeorm';

/** สร้างไซต์ส่วนตัวให้ผู้ใช้ (ถ้ายังไม่มี) คืน id ของไซต์ */
export async function ensurePersonalSite(manager: EntityManager, userId: string): Promise<string> {
  const existing: { id: string }[] = await manager.query(
    `SELECT id FROM sites WHERE created_by = $1 AND is_personal`,
    [userId],
  );
  if (existing.length > 0) return existing[0].id;
  const rows: { id: string }[] = await manager.query(
    `INSERT INTO sites (name, kind, is_personal, created_by) VALUES ('ไซต์ของฉัน','home',true,$1)
     ON CONFLICT DO NOTHING RETURNING id`,
    [userId],
  );
  let id = rows[0]?.id;
  if (!id) {
    id = (await manager.query(`SELECT id FROM sites WHERE created_by = $1 AND is_personal`, [userId]))[0].id;
  }
  await manager.query(
    `INSERT INTO site_members (site_id, user_id, role) VALUES ($1,$2,'admin') ON CONFLICT DO NOTHING`,
    [id, userId],
  );
  return id;
}
