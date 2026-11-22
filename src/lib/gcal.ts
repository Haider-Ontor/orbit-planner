import { db, save, alive } from './db';
import { desktop } from './platform';
import { getSettings, setSettings } from './settings';
import { addDays, today, toISODate } from './dates';
import type { CalEvent, Task } from './types';

/* Google Calendar, two-way:
 *  - pull: events from the primary calendar (-7..+60 days) into the synced `events` table,
 *          so the phone sees them through cloud sync too
 *  - push: tasks that have a time (start, or due date + time) become calendar events,
 *          tagged with extendedProperties.private.orbitTaskId
 * OAuth runs in the desktop app (loopback + PKCE). */

const API = 'https://www.googleapis.com/calendar/v3';
let access = { token: '', exp: 0 };

export const gcalAvailable = () => !!desktop();
export const gcalConnected = () => !!getSettings().googleRefreshToken;

export async function connectGoogle() {
  const d = desktop();
  if (!d) throw new Error('Connect Google Calendar from the Windows app. The phone then receives events through cloud sync.');
  const s = getSettings();
  const t = await d.googleAuth({ clientId: s.googleClientId.trim(), clientSecret: s.googleClientSecret.trim() });
  if (!t.refresh_token) throw new Error('Google did not return a refresh token. Remove Orbit at myaccount.google.com/permissions and try again.');
  access = { token: t.access_token, exp: Date.now() + (t.expires_in - 60) * 1000 };
  let email = '';
  try { if (t.id_token) email = JSON.parse(atob(t.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email ?? ''; } catch { /* ignore */ }
  setSettings({ googleRefreshToken: t.refresh_token, googleEmail: email });
}

export function disconnectGoogle() {
  access = { token: '', exp: 0 };
  setSettings({ googleRefreshToken: '', googleEmail: '' });
}

async function token(): Promise<string> {
  if (access.token && Date.now() < access.exp) return access.token;
  const d = desktop();
  const s = getSettings();
  if (!d || !s.googleRefreshToken) throw new Error('Google Calendar is not connected.');
  const t = await d.googleRefresh({ clientId: s.googleClientId.trim(), clientSecret: s.googleClientSecret.trim(), refreshToken: s.googleRefreshToken });
  access = { token: t.access_token, exp: Date.now() + (t.expires_in - 60) * 1000 };
  return access.token;
}

async function api(path: string, init: RequestInit = {}) {
  const r = await fetch(API + path, { ...init, headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(j?.error?.message || `Google Calendar error ${r.status}`) as Error & { status?: number };
    err.status = r.status;
    throw err;
  }
  return j;
}

interface GEvent {
  id: string; status: string; summary?: string; location?: string; htmlLink: string;
  start: { date?: string; dateTime?: string }; end: { date?: string; dateTime?: string };
  extendedProperties?: { private?: Record<string, string> };
}

export async function pullEvents() {
  const timeMin = new Date(addDays(today(), -7) + 'T00:00:00').toISOString();
  const timeMax = new Date(addDays(today(), 60) + 'T00:00:00').toISOString();
  const seen = new Set<string>();
  let pageToken = '';
  do {
    const q = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '250' });
    if (pageToken) q.set('pageToken', pageToken);
    const j = await api(`/calendars/primary/events?${q}`);
    for (const e of (j.items || []) as GEvent[]) {
      if (e.status === 'cancelled') continue;
      seen.add(e.id);
      const rec: CalEvent = {
        id: e.id, updated_at: 0, deleted: 0,
        summary: e.summary || '(no title)',
        start: e.start.dateTime || e.start.date || '',
        end: e.end.dateTime || e.end.date || '',
        allDay: !!e.start.date,
        location: e.location || '',
        htmlLink: e.htmlLink,
        fromOrbit: !!e.extendedProperties?.private?.orbitTaskId,
      };
      const cur = await db.events.get(e.id);
      if (!cur || cur.deleted || cur.summary !== rec.summary || cur.start !== rec.start || cur.end !== rec.end || cur.location !== rec.location) {
        await save('events', rec);
      }
    }
    pageToken = j.nextPageToken || '';
  } while (pageToken);

  // Events that vanished from Google inside the window → delete locally.
  const local = alive(await db.events.toArray());
  for (const ev of local) {
    const d = ev.start.slice(0, 10);
    if (d >= addDays(today(), -7) && d < addDays(today(), 60) && !seen.has(ev.id)) await save('events', { ...ev, deleted: 1 });
  }
}

function eventBody(t: Task) {
  const s = getSettings();
  void s;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let start: string, end: string;
  if (t.start) {
    start = t.start;
    const e = new Date(t.start);
    e.setMinutes(e.getMinutes() + (t.durationMin || 60));
    end = toLocalISO(e);
  } else {
    start = `${t.due}T${t.dueTime}`;
    const e = new Date(start);
    e.setMinutes(e.getMinutes() + (t.durationMin || 30));
    end = toLocalISO(e);
  }
  const req = t.requirements.length ? '\n\nNeeded:\n' + t.requirements.map((r) => `${r.done ? '☑' : '☐'} ${r.text}`).join('\n') : '';
  return {
    summary: (t.status === 'done' ? '✓ ' : '') + t.title,
    description: (t.details || '') + req + (t.links.length ? '\n\n' + t.links.join('\n') : '') + '\n\n— from Orbit',
    start: { dateTime: start.length === 16 ? start + ':00' : start, timeZone: tz },
    end: { dateTime: end, timeZone: tz },
    extendedProperties: { private: { orbitTaskId: t.id } },
    reminders: { useDefault: true },
  };
}

function toLocalISO(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${toISODate(d)}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

const hasTime = (t: Task) => !!t.start || (!!t.due && !!t.dueTime);

export async function pushTasks() {
  const tasks = await db.tasks.toArray();
  for (const t of tasks) {
    const want = !t.deleted && hasTime(t);
    try {
      if (want && !t.gcalEventId) {
        const ev = await api('/calendars/primary/events', { method: 'POST', body: JSON.stringify(eventBody(t)) });
        await save('tasks', { ...t, gcalEventId: ev.id });
      } else if (want && t.gcalEventId && t.updated_at > (Number(localStorage.getItem('orbit.gcal.pushed.' + t.id)) || 0)) {
        await api(`/calendars/primary/events/${encodeURIComponent(t.gcalEventId)}`, { method: 'PATCH', body: JSON.stringify(eventBody(t)) });
      } else if (!want && t.gcalEventId) {
        await api(`/calendars/primary/events/${encodeURIComponent(t.gcalEventId)}`, { method: 'DELETE' }).catch((e) => { if (e.status !== 404 && e.status !== 410) throw e; });
        if (!t.deleted) await save('tasks', { ...t, gcalEventId: null });
        else await db.tasks.update(t.id, { gcalEventId: null });
      } else continue;
      const fresh = await db.tasks.get(t.id);
      localStorage.setItem('orbit.gcal.pushed.' + t.id, String(fresh?.updated_at ?? Date.now()));
    } catch (e) {
      const status = (e as { status?: number }).status;
      if ((status === 404 || status === 410) && t.gcalEventId) await save('tasks', { ...t, gcalEventId: null }); // event deleted in Google; recreate next time
      else throw e;
    }
  }
}

let busy = false;
export async function syncCalendar(): Promise<string> {
  if (!gcalAvailable() || !gcalConnected()) return '';
  if (busy) return '';
  busy = true;
  try {
    await pushTasks();
    await pullEvents();
    localStorage.setItem('orbit.gcal.last', String(Date.now()));
    return 'Calendar synced';
  } finally { busy = false; }
}
