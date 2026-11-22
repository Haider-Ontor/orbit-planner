import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { db, onLocalChange } from './db';
import { SYNC_TABLES, type Base, type SyncKind } from './types';
import { getSettings, setSettings } from './settings';

/* Cloud sync through one Supabase table:
 *   items(id, user_id, kind, data jsonb, updated_at bigint, deleted bool, synced_at timestamptz)
 * Push: every locally dirty record is upserted; a trigger refuses older writes (last write wins).
 * Pull: rows whose server synced_at is newer than our cursor. Realtime pokes trigger a pull. */

export type SyncState = { status: 'off' | 'signed-out' | 'idle' | 'syncing' | 'error'; message: string; email: string; lastSync: number };
let state: SyncState = { status: 'off', message: 'Cloud sync not configured', email: '', lastSync: 0 };
const subs = new Set<() => void>();
function set(p: Partial<SyncState>) { state = { ...state, ...p }; subs.forEach((f) => f()); }
export const useSync = () => useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => state);

let sb: SupabaseClient | null = null;
let sbKey = '';
let session: Session | null = null;
let timer: number | undefined;
let running = false;
let again = false;

export function supabase(): SupabaseClient | null {
  const { supabaseUrl, supabaseAnonKey } = getSettings();
  if (!supabaseUrl || !supabaseAnonKey) { sb = null; return null; }
  const k = supabaseUrl + '|' + supabaseAnonKey;
  if (!sb || k !== sbKey) {
    sb = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'orbit.auth' } });
    sbKey = k;
    sb.auth.onAuthStateChange((_e, s) => {
      session = s;
      set({ status: s ? 'idle' : 'signed-out', email: s?.user.email ?? '', message: s ? 'Signed in' : 'Sign in to sync' });
      if (s) { subscribeRealtime(); syncSoon(200); }
    });
  }
  return sb;
}

export async function initSync() {
  const c = supabase();
  if (!c) { set({ status: 'off', message: 'Cloud sync not configured' }); return; }
  const { data } = await c.auth.getSession();
  session = data.session;
  set({ status: session ? 'idle' : 'signed-out', email: session?.user.email ?? '', message: session ? 'Signed in' : 'Sign in to sync' });
  if (session) { subscribeRealtime(); syncSoon(100); }
}

export async function signIn(email: string, password: string, create: boolean) {
  const c = supabase();
  if (!c) throw new Error('Enter the Supabase URL and anon key first.');
  const r = create ? await c.auth.signUp({ email, password }) : await c.auth.signInWithPassword({ email, password });
  if (r.error) throw r.error;
  if (create && !r.data.session) return 'Check your inbox to confirm the account, then sign in.';
  return 'Signed in.';
}

export async function signOut() {
  await supabase()?.auth.signOut();
  setSettings({ lastPull: '' });
}

let channel: ReturnType<SupabaseClient['channel']> | null = null;
function subscribeRealtime() {
  const c = supabase();
  if (!c || channel) return;
  channel = c.channel('orbit-items')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => syncSoon(400))
    .subscribe();
}

export function syncSoon(ms = 1500) {
  if (!session) return;
  clearTimeout(timer);
  timer = window.setTimeout(syncNow, ms);
}

export async function syncNow() {
  const c = supabase();
  if (!c || !session) return;
  if (running) { again = true; return; }
  running = true;
  set({ status: 'syncing', message: 'Syncing…' });
  try {
    await push(c);
    await pull(c);
    set({ status: 'idle', message: 'Up to date', lastSync: Date.now() });
  } catch (e) {
    set({ status: 'error', message: e instanceof Error ? e.message : String(e) });
  } finally {
    running = false;
    if (again) { again = false; syncSoon(300); }
  }
}

async function push(c: SupabaseClient) {
  const userId = session!.user.id;
  for (const kind of SYNC_TABLES) {
    const table = db[kind];
    const dirty = (await table.where('dirty').equals(1).toArray()) as Base[];
    for (let i = 0; i < dirty.length; i += 200) {
      const chunk = dirty.slice(i, i + 200);
      const rows = chunk.map(({ dirty: _d, ...rec }) => ({
        id: `${kind}:${rec.id}`, user_id: userId, kind, data: rec, updated_at: rec.updated_at, deleted: !!rec.deleted,
      }));
      const { error } = await c.from('items').upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(`Push failed: ${error.message}`);
      // Clear the flag only if the record was not edited again meanwhile.
      await db.transaction('rw', table, async () => {
        for (const r of chunk) {
          const cur = (await table.get(r.id)) as Base | undefined;
          if (cur && cur.updated_at === r.updated_at) await table.update(r.id, { dirty: 0 } as never);
        }
      });
    }
  }
}

async function pull(c: SupabaseClient) {
  let cursor = getSettings().lastPull || '1970-01-01T00:00:00Z';
  for (;;) {
    const { data, error } = await c.from('items')
      .select('kind,data,updated_at,synced_at')
      .gt('synced_at', cursor)
      .order('synced_at', { ascending: true })
      .limit(500);
    if (error) throw new Error(`Pull failed: ${error.message}`);
    if (!data?.length) break;
    for (const row of data as { kind: SyncKind; data: Base; updated_at: number; synced_at: string }[]) {
      if (!SYNC_TABLES.includes(row.kind)) continue;
      const table = db[row.kind];
      const local = (await table.get(row.data.id)) as Base | undefined;
      if (!local || (row.updated_at >= local.updated_at && !(local.dirty && local.updated_at > row.updated_at))) {
        await table.put({ ...row.data, dirty: 0 } as never);
      }
      cursor = row.synced_at;
    }
    setSettings({ lastPull: cursor });
    if (data.length < 500) break;
  }
}

// Push shortly after any local edit; also on focus and every 2 minutes.
onLocalChange(() => syncSoon());
window.addEventListener('focus', () => syncSoon(300));
window.addEventListener('online', () => syncSoon(300));
setInterval(() => syncSoon(0), 120_000);
