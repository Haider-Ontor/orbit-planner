import { db, save } from './db';
import { SYNC_TABLES, type Base } from './types';
import { today } from './dates';
import { desktop } from './platform';

/* Keeping data safe without any account:
 *  1. ask the browser engine to never evict Orbit's storage
 *  2. one automatic snapshot per day inside the app (last 14 kept)
 *  3. on Windows, the same snapshot as a file in Documents\Orbit Backups (last 30 kept)
 * Snapshots include deleted items, so anything can be brought back. */

const KEEP = 14;

export async function ensurePersistentStorage() {
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch { /* not supported */ }
}

export async function exportAll(): Promise<{ json: string; counts: Record<string, number> }> {
  const out: Record<string, unknown> = { app: 'orbit', version: 1, exportedAt: new Date().toISOString() };
  const counts: Record<string, number> = {};
  for (const k of SYNC_TABLES) {
    const rows = (await db[k].toArray()) as Base[];
    out[k] = rows;
    counts[k] = rows.filter((r) => !r.deleted).length;
  }
  return { json: JSON.stringify(out), counts };
}

/** Take today's snapshot; refresh it when it is more than 6 hours old. */
export async function dailySnapshot(force = false) {
  const id = today();
  const cur = await db.snapshots.get(id);
  if (!force && cur && Date.now() - cur.createdAt < 6 * 3600_000) return;
  const { json, counts } = await exportAll();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total && !force) return; // nothing worth saving yet
  await db.snapshots.put({ id, createdAt: Date.now(), counts, data: json });
  const all = await db.snapshots.orderBy('createdAt').toArray();
  for (const s of all.slice(0, Math.max(0, all.length - KEEP))) await db.snapshots.delete(s.id);
  try { await desktop()?.writeBackup?.(`orbit-${id}.json`, json); } catch (e) { console.warn('backup file failed', e); }
}

export function startAutoBackup() {
  const run = () => dailySnapshot().catch((e) => console.warn('snapshot failed', e));
  setTimeout(run, 8000);          // shortly after start
  setInterval(run, 60 * 60_000);  // picks up the new day if Orbit stays open
}

/** Put every record from a backup back (marked as changed so it also syncs).
 *  Items created after the backup are kept. */
export async function restoreFrom(json: string): Promise<number> {
  const j = JSON.parse(json);
  if (j.app !== 'orbit') throw new Error('Not an Orbit backup.');
  let n = 0;
  for (const k of SYNC_TABLES) {
    for (const r of (j[k] || []) as Base[]) { await save(k, r); n++; }
  }
  return n;
}
