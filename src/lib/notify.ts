import { LocalNotifications } from '@capacitor/local-notifications';
import { db, alive } from './db';
import { isAndroid, desktop } from './platform';
import { getSettings } from './settings';
import { today, niceTime, toISODate, timeOfISO } from './dates';
import { isDueOn } from './recurrence';
import { score } from './priority';
import type { Task } from './types';
import { deadlinesOf, goalDueText } from './models';
import { deadlineMs } from './deadline';

/* Reminders.
 *  Android: schedule real OS notifications (fire even when the app is closed).
 *  Desktop: the app stays in the tray and checks every 30 s. */

interface Reminder { key: string; at: number; title: string; body: string }

function whenOf(t: Task): number | null {
  if (t.start) return new Date(t.start).getTime();
  if (t.due && t.dueTime) return new Date(`${t.due}T${t.dueTime}:00`).getTime();
  return null;
}

/** All reminders whose fire time is within [from, to). */
export async function remindersBetween(from: number, to: number): Promise<Reminder[]> {
  const s = getSettings();
  const out: Reminder[] = [];
  const tasks = alive(await db.tasks.toArray()).filter((t) => t.status !== 'done');

  for (const t of tasks) {
    const at = whenOf(t);
    if (at === null) continue;
    const fire = at - s.remindMinutesBefore * 60_000;
    if (fire < from || fire >= to) continue;
    const pending = t.requirements.filter((r) => !r.done).map((r) => r.text);
    const body = `${t.start ? 'Starts' : 'Due'} at ${niceTime(timeOfISO(new Date(at).toISOString()))}` +
      (pending.length ? ` · Still needed: ${pending.slice(0, 3).join(', ')}` : '');
    out.push({ key: `t:${t.id}:${at}`, at: fire, title: t.title, body });
  }

  // goal / project steps and goals with a deadline time: remind before it
  const projects = alive(await db.projects.toArray());
  const steps = deadlinesOf(projects);
  const goals = alive(await db.goals.toArray()).filter((g) => g.status === 'active' && g.deadline);
  for (const d of steps) {
    if (!d.dueTime) continue;
    const fire = d.at - s.remindMinutesBefore * 60_000;
    if (fire < from || fire >= to) continue;
    out.push({ key: `s:${d.taskId}:${d.subId ?? ''}:${d.at}`, at: fire, title: d.name, body: `Due at ${niceTime(d.dueTime)} · ${d.parent ? `${d.parent} · ` : ''}${d.projectName}` });
  }
  for (const g of goals) {
    if (!g.deadlineTime) continue;
    const at = deadlineMs(g.deadline, g.deadlineTime)!;
    const fire = at - s.remindMinutesBefore * 60_000;
    if (fire >= from && fire < to) out.push({ key: `g:${g.id}:${at}`, at: fire, title: `Goal: ${g.title}`, body: `Due ${goalDueText(g)}` });
  }

  const routines = alive(await db.routines.toArray());
  const d0 = new Date(from); d0.setHours(0, 0, 0, 0);
  for (const d = new Date(d0); d.getTime() < to; d.setDate(d.getDate() + 1)) {
    const iso = toISODate(d);
    for (const r of routines) {
      if (!r.time || !isDueOn(r, iso) || r.log[iso]) continue;
      const at = new Date(`${iso}T${r.time}:00`).getTime();
      if (at >= from && at < to) out.push({ key: `r:${r.id}:${iso}`, at, title: r.title, body: `Routine · ${r.category || 'Daily'}` });
    }
  }

  const [h, m] = (s.dailyDigestTime || '08:00').split(':').map(Number);
  const top = tasks.slice().sort((a, b) => score(b) - score(a)).slice(0, 3).map((t) => t.title);
  for (const d = new Date(d0); d.getTime() < to; d.setDate(d.getDate() + 1)) {
    const at = new Date(d); at.setHours(h, m, 0, 0);
    if (at.getTime() >= from && at.getTime() < to) {
      // deadlines on that day (steps and goals), then the most important tasks
      const day = toISODate(at);
      const dueOn = (iso: string) => [
        ...steps.filter((x) => x.due === iso).map((x) => x.name + (x.dueTime ? ` ${niceTime(x.dueTime)}` : '')),
        ...goals.filter((g) => g.deadline === iso && g.dueMode !== 'month').map((g) => g.title + (g.deadlineTime ? ` ${niceTime(g.deadlineTime)}` : '')),
      ];
      const tdy = dueOn(day), tmr = dueOn(toISODate(new Date(at.getFullYear(), at.getMonth(), at.getDate() + 1)));
      const parts = [
        tdy.length ? 'Due today: ' + tdy.slice(0, 4).join(' · ') : '',
        tmr.length ? 'Tomorrow: ' + tmr.slice(0, 3).join(' · ') : '',
        top.length ? 'Focus: ' + top.join(' · ') : '',
      ].filter(Boolean);
      out.push({ key: `digest:${day}`, at: at.getTime(), title: 'Today in Orbit', body: parts.length ? parts.join('\n') : 'Nothing urgent. Plan something good.' });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/* ---------- Android ---------- */
let androidTimer: number | undefined;
export function rescheduleAndroid() {
  if (!isAndroid()) return;
  clearTimeout(androidTimer);
  androidTimer = window.setTimeout(async () => {
    try {
      await clearAndroid();
      if (!getSettings().remindersOn) return;
      let perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') perm = await LocalNotifications.requestPermissions();
      if (perm.display !== 'granted') return;
      const now = Date.now();
      const list = (await remindersBetween(now, now + 7 * 86400_000)).slice(0, 60);
      if (list.length) {
        await LocalNotifications.schedule({
          notifications: list.map((u, i) => ({ id: i + 1, title: u.title, body: u.body, schedule: { at: new Date(u.at), allowWhileIdle: true } })),
        });
      }
    } catch (e) { console.warn('reminder scheduling failed', e); }
  }, 1500);
}
async function clearAndroid() {
  const p = await LocalNotifications.getPending();
  if (p.notifications.length) await LocalNotifications.cancel({ notifications: p.notifications.map((n) => ({ id: n.id })) });
}

/* ---------- Desktop / web ---------- */
const FIRED_KEY = 'orbit.fired';
function readFired(): Record<string, number> { try { return JSON.parse(localStorage.getItem(FIRED_KEY) || '{}'); } catch { return {}; } }

export function startDesktopReminders() {
  if (isAndroid()) return;
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  const check = async () => {
    const n = alive(await db.tasks.toArray()).filter((t) => t.status !== 'done' && t.due && t.due <= today()).length;
    desktop()?.setBadge(n);
    if (!getSettings().remindersOn || !('Notification' in window) || Notification.permission !== 'granted') return;
    const now = Date.now();
    const fired = readFired();
    // Anything that should have fired in the last 10 minutes and has not.
    for (const r of await remindersBetween(now - 10 * 60_000, now + 1)) {
      if (fired[r.key]) continue;
      new Notification(r.title, { body: r.body, tag: r.key });
      fired[r.key] = now;
    }
    for (const k of Object.keys(fired)) if (now - fired[k] > 3 * 86400_000) delete fired[k];
    try { localStorage.setItem(FIRED_KEY, JSON.stringify(fired)); } catch { /* ignore */ }
  };
  check();
  setInterval(check, 30_000);
}
