import { db, save, alive } from './db';
import { getSettings } from './settings';
import { addDays, today, toISODate } from './dates';
import { http } from './http';
import { googleToken, calendarGranted } from './google';
import { quadrantOf, type Quadrant } from './priority';
import type { CalEvent, Task, Routine } from './types';

/* Google Calendar, both directions, on Windows and Android.
 *  push: every task with a date → an event (timed if it has a time, all-day otherwise);
 *        every repeating task → a recurring event. Event ids are derived from Orbit's
 *        own ids, so two devices can never create the same event twice.
 *  pull: events from the primary calendar (-7..+60 days) → shown in Today / Calendar. */

const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export const gcalAvailable = () => true;
export const gcalConnected = () => calendarGranted();

type HttpErr = Error & { status?: number };
async function api(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, body?: unknown, retry = true): Promise<Record<string, unknown> | null> {
  const r = await http(method, url, { Authorization: `Bearer ${await googleToken()}`, 'Content-Type': 'application/json' }, body === undefined ? null : JSON.stringify(body));
  if (r.status === 401 && retry) { await googleToken(true); return api(method, url, body, false); }
  if (r.status === 204 || !r.text) return null;
  let j: Record<string, unknown> = {};
  try { j = JSON.parse(r.text); } catch { /* not JSON */ }
  if (r.status >= 400) {
    const err = (j.error ?? {}) as { message?: string; errors?: { reason?: string }[] };
    let msg = err.message || `Google Calendar error ${r.status}`;
    if (r.status === 403 && /insufficient/i.test(msg)) msg = 'ACCESS_TOKEN_SCOPE_INSUFFICIENT';
    if (r.status === 403 && /has not been used|is disabled/i.test(msg)) msg = 'The Google Calendar API is not enabled in your Google Cloud project.';
    const e: HttpErr = new Error(msg); e.status = r.status; throw e;
  }
  return j;
}

/* ---------- ids & bodies ---------- */
async function eventIdFor(kind: 't' | 'r', id: string): Promise<string> {
  // Calendar ids allow a–v and 0–9; a hex digest fits that.
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(`${kind}:${id}`));
  return 'orbit' + [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const p2 = (n: number) => String(n).padStart(2, '0');
const localISO = (d: Date) => `${toISODate(d)}T${p2(d.getHours())}:${p2(d.getMinutes())}:00`;
// Google Calendar's own palette, closest to Orbit's priority colours.
const COLOR: Record<Quadrant, string> = { first: '11', second: '5', third: '10', eliminate: '7' };

const hasDate = (t: Task) => !!(t.start || t.due);

function taskBody(t: Task) {
  let start: Record<string, string>, end: Record<string, string>;
  if (t.start) {
    const e = new Date(t.start); e.setMinutes(e.getMinutes() + (t.durationMin || 60));
    start = { dateTime: t.start.length === 16 ? t.start + ':00' : t.start, timeZone: tz() }; end = { dateTime: localISO(e), timeZone: tz() };
  } else if (t.due && t.dueTime) {
    const s = new Date(`${t.due}T${t.dueTime}:00`); const e = new Date(s); e.setMinutes(e.getMinutes() + (t.durationMin || 30));
    start = { dateTime: localISO(s), timeZone: tz() }; end = { dateTime: localISO(e), timeZone: tz() };
  } else {
    start = { date: t.due! }; end = { date: addDays(t.due!, 1) };
  }
  const req = t.requirements.length ? '\n\nNeeded:\n' + t.requirements.map((r) => `${r.done ? '☑' : '☐'} ${r.text}`).join('\n') : '';
  return {
    summary: (t.status === 'done' ? '✓ ' : '') + (t.title || 'Untitled task'),
    description: [t.details, req.trim(), t.links.join('\n')].filter(Boolean).join('\n\n') + '\n\n— from Orbit',
    start, end, colorId: COLOR[quadrantOf(t)],
    transparency: 'transparent',
    extendedProperties: { private: { orbitId: t.id, orbitKind: 'task' } },
  };
}

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
function routineBody(r: Routine) {
  let rule = 'RRULE:FREQ=DAILY';
  if (r.freq === 'weekdays') rule = 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
  else if (r.freq === 'weekly') rule = `RRULE:FREQ=WEEKLY;BYDAY=${(r.days.length ? r.days : [new Date().getDay()]).map((d) => BYDAY[d]).join(',')}`;
  else if (r.freq === 'interval') rule = `RRULE:FREQ=DAILY;INTERVAL=${Math.max(1, r.every)}`;
  let start: Record<string, string>, end: Record<string, string>;
  if (r.time) {
    const s = new Date(`${r.startDate}T${r.time}:00`); const e = new Date(s); e.setMinutes(e.getMinutes() + 30);
    start = { dateTime: localISO(s), timeZone: tz() }; end = { dateTime: localISO(e), timeZone: tz() };
  } else { start = { date: r.startDate }; end = { date: addDays(r.startDate, 1) }; }
  return {
    summary: '↻ ' + r.title, description: 'Repeating task\n\n— from Orbit', start, end, recurrence: [rule],
    transparency: 'transparent',
    extendedProperties: { private: { orbitId: r.id, orbitKind: 'routine' } },
  };
}

/* ---------- push ---------- */
const hashKey = (id: string) => 'orbit.gcal.h.' + id;
async function digest(s: string) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Create or update one event; returns its id. Handles events that already exist
 *  (made by the other device) and events deleted in Google. */
async function upsert(eventId: string, body: Record<string, unknown>): Promise<void> {
  try {
    await api('PATCH', `${API}/${eventId}`, { ...body, status: 'confirmed' });
  } catch (e) {
    const st = (e as HttpErr).status;
    if (st !== 404 && st !== 410) throw e;
    try { await api('POST', API, { ...body, id: eventId }); }
    catch (e2) { if ((e2 as HttpErr).status === 409) await api('PATCH', `${API}/${eventId}`, { ...body, status: 'confirmed' }); else throw e2; }
  }
}
async function removeEvent(eventId: string) {
  try { await api('DELETE', `${API}/${eventId}`); } catch (e) { const st = (e as HttpErr).status; if (st !== 404 && st !== 410) throw e; }
}

export async function pushAll(): Promise<number> {
  let n = 0;
  for (const t of await db.tasks.toArray()) {
    const id = await eventIdFor('t', t.id);
    const want = !t.deleted && hasDate(t);
    if (want) {
      const body = taskBody(t);
      const h = await digest(JSON.stringify(body));
      if (localStorage.getItem(hashKey(id)) === h) continue;
      await upsert(id, body);
      localStorage.setItem(hashKey(id), h); n++;
      if (t.gcalEventId !== id) await db.tasks.update(t.id, { gcalEventId: id }); // local hint only; the id is derived anyway
    } else if (localStorage.getItem(hashKey(id)) !== 'gone' && (t.gcalEventId || localStorage.getItem(hashKey(id)))) {
      await removeEvent(id); localStorage.setItem(hashKey(id), 'gone'); n++;
      if (t.gcalEventId) await db.tasks.update(t.id, { gcalEventId: null });
    }
  }
  for (const r of await db.routines.toArray()) {
    const id = await eventIdFor('r', r.id);
    const want = !r.deleted && !r.archived;
    if (want) {
      const body = routineBody(r);
      const h = await digest(JSON.stringify(body));
      if (localStorage.getItem(hashKey(id)) === h) continue;
      await upsert(id, body);
      localStorage.setItem(hashKey(id), h); n++;
    } else if (localStorage.getItem(hashKey(id)) && localStorage.getItem(hashKey(id)) !== 'gone') {
      await removeEvent(id); localStorage.setItem(hashKey(id), 'gone'); n++;
    }
  }
  return n;
}

/* ---------- pull ---------- */
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
    const j = (await api('GET', `${API}?${q}`)) as { items?: GEvent[]; nextPageToken?: string } | null;
    for (const e of j?.items ?? []) {
      if (e.status === 'cancelled') continue;
      seen.add(e.id);
      const priv = e.extendedProperties?.private ?? {};
      const rec: CalEvent = {
        id: e.id, updated_at: 0, deleted: 0,
        summary: e.summary || '(no title)',
        start: e.start.dateTime || e.start.date || '',
        end: e.end.dateTime || e.end.date || '',
        allDay: !!e.start.date,
        location: e.location || '',
        htmlLink: e.htmlLink,
        fromOrbit: !!(priv.orbitId || priv.orbitTaskId),
      };
      const cur = await db.events.get(e.id);
      if (!cur || cur.deleted || cur.summary !== rec.summary || cur.start !== rec.start || cur.end !== rec.end || cur.location !== rec.location || cur.fromOrbit !== rec.fromOrbit) {
        await save('events', rec);
      }
    }
    pageToken = j?.nextPageToken || '';
  } while (pageToken);
  for (const ev of alive(await db.events.toArray())) {
    const d = ev.start.slice(0, 10);
    if (d >= addDays(today(), -7) && d < addDays(today(), 60) && !seen.has(ev.id)) await save('events', { ...ev, deleted: 1 });
  }
}

/* ---------- run ---------- */
let busy = false;
export async function syncCalendar(): Promise<string> {
  if (!gcalConnected() || busy) return '';
  busy = true;
  try {
    const s = getSettings();
    const pushed = s.calendarPush ? await pushAll() : 0;
    if (s.calendarPull) await pullEvents();
    localStorage.setItem('orbit.gcal.last', String(Date.now()));
    return pushed ? `Calendar updated (${pushed} change${pushed === 1 ? '' : 's'})` : 'Calendar up to date';
  } finally { busy = false; }
}

/** Start automatic calendar sync (both platforms). */
let timer: number | undefined;
export function calendarSoon(ms = 8000) {
  clearTimeout(timer);
  timer = window.setTimeout(() => { syncCalendar().catch((e) => console.warn('calendar sync', e)); }, ms);
}
