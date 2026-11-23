import type { Base } from './types';

/* Merge two copies of the same table by record id: the newer `updated_at`
 * wins (deletions are records with deleted = 1, so they merge the same way).
 * Pure, so it is easy to test. */

export interface MergeResult<T extends Base> {
  merged: T[];        // what the shared copy should contain
  toLocal: T[];       // remote records that are newer than (or missing from) this device
  remoteStale: boolean; // this device has something the shared copy lacks
}

const TOMBSTONE_DAYS = 90;

export function mergeRecords<T extends Base>(local: T[], remote: T[], now = Date.now()): MergeResult<T> {
  const byId = new Map<string, T>();
  const remoteIds = new Map<string, T>();
  for (const r of remote) if (r && r.id) remoteIds.set(r.id, r);
  const toLocal: T[] = [];
  let remoteStale = false;

  // Deletions older than 90 days are forgotten so the file doesn't grow forever.
  const cutoff = now - TOMBSTONE_DAYS * 86400_000;
  const expired = (x: T) => !!x.deleted && x.updated_at < cutoff;

  for (const l of local) byId.set(l.id, l);
  for (const r of remoteIds.values()) {
    const l = byId.get(r.id);
    if (!l || r.updated_at > l.updated_at) { byId.set(r.id, r); if (!expired(r)) toLocal.push(r); }
  }
  for (const l of local) {
    if (expired(l)) continue; // never re-upload a forgotten deletion
    const r = remoteIds.get(l.id);
    if (!r || l.updated_at > r.updated_at) remoteStale = true;
  }
  for (const r of remoteIds.values()) if (expired(r)) remoteStale = true; // clean it out of the shared copy

  const merged = [...byId.values()].filter((x) => !expired(x)).map(strip);
  return { merged, toLocal, remoteStale };
}

/** Drop device-only fields before sharing. */
function strip<T extends Base>(r: T): T {
  if (!('dirty' in r)) return r;
  const { dirty: _d, ...rest } = r;
  return rest as T;
}
