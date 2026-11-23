import { useSyncExternalStore } from 'react';
import type { Table } from 'dexie';
import { db, onLocalChange } from './db';
import { SYNC_TABLES, type Base } from './types';
import { http } from './http';
import { driveToken, driveConnected } from './google';
import { mergeRecords } from './merge';
import { today } from './dates';
import { rescheduleAndroid } from './notify';

/* Sync and backup through the user's own Google Drive.
 *
 *   My Drive / Orbit / orbit-data.json             ← the shared copy every device merges with
 *   My Drive / Orbit / orbit-backup-YYYY-MM-DD.json ← one per day, last 14 kept
 *
 * Each sync: download the shared copy → keep the newer version of every record
 * on both sides → upload the result if this device had anything newer.
 * Because each device always uploads everything it knows, two devices editing
 * at the same time can't lose each other's changes; the next sync fixes it. */

const FOLDER = 'Orbit';
const DATA = 'orbit-data.json';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const KEEP_BACKUPS = 14;

export type DriveState = { status: 'off' | 'idle' | 'syncing' | 'error'; message: string; lastSync: number };
let state: DriveState = { status: driveConnected() ? 'idle' : 'off', message: '', lastSync: Number(localStorage.getItem('orbit.drive.last') || 0) };
const subs = new Set<() => void>();
function set(p: Partial<DriveState>) { state = { ...state, ...p }; subs.forEach((f) => f()); }
export const useDriveSync = () => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => state);

/* ---------- Drive REST helpers ---------- */
async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body: string | null = null, contentType?: string, retry = true): Promise<string> {
  const token = await driveToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (contentType) headers['Content-Type'] = contentType;
  const r = await http(method, url, headers, body);
  if (r.status === 401 && retry) { await driveToken(true); return call(method, url, body, contentType, false); }
  if (r.status === 404) throw Object.assign(new Error('not found'), { status: 404 });
  if (r.status >= 400) {
    let msg = r.text.slice(0, 200);
    try { msg = JSON.parse(r.text).error?.message ?? msg; } catch { /* ignore */ }
    if (r.status === 403 && /has not been used|is disabled/i.test(msg)) msg = 'The Google Drive API is not enabled in your Google Cloud project.';
    throw Object.assign(new Error(`Google Drive: ${msg}`), { status: r.status });
  }
  return r.text;
}
const q = (s: string) => encodeURIComponent(s);

async function folderId(): Promise<string> {
  const cachedId = localStorage.getItem('orbit.drive.folder');
  if (cachedId) {
    try { const f = JSON.parse(await call('GET', `${API}/files/${cachedId}?fields=id,trashed`)); if (!f.trashed) return cachedId; } catch { /* re-find */ }
  }
  const found = JSON.parse(await call('GET', `${API}/files?q=${q(`name='${FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id)&spaces=drive`));
  let id: string = found.files?.[0]?.id;
  if (!id) id = JSON.parse(await call('POST', `${API}/files?fields=id`, JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' }), 'application/json')).id;
  localStorage.setItem('orbit.drive.folder', id);
  return id;
}

async function findFile(parent: string, name: string): Promise<string | null> {
  const r = JSON.parse(await call('GET', `${API}/files?q=${q(`name='${name}' and '${parent}' in parents and trashed=false`)}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc&spaces=drive`));
  return r.files?.[0]?.id ?? null;
}

async function upload(parent: string, name: string, json: string, id: string | null): Promise<string> {
  if (id) {
    await call('PATCH', `${UPLOAD}/files/${id}?uploadType=media`, json, 'application/json');
    return id;
  }
  const b = 'orbit' + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name, parents: [parent], mimeType: 'application/json' });
  const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${b}--`;
  return JSON.parse(await call('POST', `${UPLOAD}/files?uploadType=multipart&fields=id`, body, `multipart/related; boundary=${b}`)).id;
}

/* ---------- the sync itself ---------- */
let running = false;
let again = false;

export async function syncDrive(): Promise<string> {
  if (!driveConnected()) { set({ status: 'off' }); return ''; }
  if (running) { again = true; return ''; }
  running = true;
  set({ status: 'syncing', message: 'Syncing with Google Drive…' });
  try {
    const parent = await folderId();
    let fileId = localStorage.getItem('orbit.drive.file');
    let remoteText = '';
    try {
      if (!fileId) throw Object.assign(new Error(), { status: 404 });
      remoteText = await call('GET', `${API}/files/${fileId}?alt=media`);
    } catch (e) {
      if ((e as { status?: number }).status !== 404) throw e;
      fileId = await findFile(parent, DATA);
      remoteText = fileId ? await call('GET', `${API}/files/${fileId}?alt=media`) : '';
    }
    let remote: Record<string, Base[]> = {};
    if (remoteText) {
      try { const j = JSON.parse(remoteText); if (j.app === 'orbit') remote = j.data ?? {}; } catch { /* corrupt shared copy: rebuild it from this device */ }
    }

    let stale = !fileId;
    let pulled = 0;
    const out: Record<string, Base[]> = {};
    for (const k of SYNC_TABLES) {
      const table = db[k] as unknown as Table<Base, string>;
      const local = await table.toArray();
      const m = mergeRecords(local, remote[k] ?? []);
      if (m.toLocal.length) { await table.bulkPut(m.toLocal.map((r) => ({ ...r, dirty: 0 as const }))); pulled += m.toLocal.length; }
      if (m.remoteStale) stale = true;
      out[k] = m.merged;
    }
    let pushed = false;
    if (stale) {
      const json = JSON.stringify({ app: 'orbit', format: 2, savedAt: new Date().toISOString(), data: out });
      fileId = await upload(parent, DATA, json, fileId);
      pushed = true;
    }
    if (fileId) localStorage.setItem('orbit.drive.file', fileId);
    await dailyBackup(parent, out);
    if (pulled) rescheduleAndroid(); // reminders for items that arrived from another device

    const now = Date.now();
    localStorage.setItem('orbit.drive.last', String(now));
    const msg = pulled ? `Got ${pulled} change${pulled === 1 ? '' : 's'} from Drive` : pushed ? 'Saved to Google Drive' : 'Up to date';
    set({ status: 'idle', message: msg, lastSync: now });
    return msg;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    set({ status: 'error', message: msg });
    throw e;
  } finally {
    running = false;
    if (again) { again = false; syncSoon(500); }
  }
}

async function dailyBackup(parent: string, data: Record<string, Base[]>) {
  const day = today();
  if (localStorage.getItem('orbit.drive.backupDay') === day) return;
  const name = `orbit-backup-${day}.json`;
  const existing = await findFile(parent, name);
  await upload(parent, name, JSON.stringify({ app: 'orbit', version: 1, exportedAt: new Date().toISOString(), ...data }), existing);
  localStorage.setItem('orbit.drive.backupDay', day);
  // keep the newest 14 daily backups
  const list = JSON.parse(await call('GET', `${API}/files?q=${q(`'${parent}' in parents and name contains 'orbit-backup-' and trashed=false`)}&fields=files(id,name)&orderBy=name desc&pageSize=100&spaces=drive`));
  for (const f of (list.files ?? []).slice(KEEP_BACKUPS)) { try { await call('DELETE', `${API}/files/${f.id}`); } catch { /* ignore */ } }
}

/** List backup files in Drive (newest first). */
export async function listDriveBackups(): Promise<{ id: string; name: string }[]> {
  const parent = await folderId();
  const list = JSON.parse(await call('GET', `${API}/files?q=${q(`'${parent}' in parents and name contains 'orbit-backup-' and trashed=false`)}&fields=files(id,name)&orderBy=name desc&pageSize=30&spaces=drive`));
  return list.files ?? [];
}
export const downloadDriveFile = (id: string) => call('GET', `${API}/files/${id}?alt=media`);

/** Forget the cached folder/file ids (after disconnecting or switching account). */
export function resetDriveCache() {
  ['orbit.drive.folder', 'orbit.drive.file', 'orbit.drive.backupDay', 'orbit.drive.last'].forEach((k) => localStorage.removeItem(k));
  set({ status: 'off', message: '', lastSync: 0 });
}

/* ---------- when to sync ---------- */
let timer: number | undefined;
export function syncSoon(ms = 15_000) {
  if (!driveConnected()) return;
  clearTimeout(timer);
  timer = window.setTimeout(() => { syncDrive().catch(() => { /* shown in status */ }); }, ms);
}

export function startDriveSync() {
  if (driveConnected()) syncSoon(2500);
  onLocalChange(() => syncSoon(15_000));      // shortly after edits
  setInterval(() => syncSoon(0), 5 * 60_000);  // and every 5 minutes
  window.addEventListener('focus', () => syncSoon(800));
  window.addEventListener('online', () => syncSoon(800));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') syncSoon(0); else syncSoon(800); });
}
