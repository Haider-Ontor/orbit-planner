import type { Task } from './types';
import { today, addDays, toISODate, parseDate } from './dates';

/** Tiny offline parser for the quick-add box.
 *  "Submit form fri 5pm !!"  → due next Friday 17:00, critical.
 *  Supports: today, tomorrow, tmr, weekday names, "in 3 days", 12/3 or 2026-12-03, times like 5pm / 17:30,
 *  "!" = important (impact 4), "!!" = important + critical. */
export function parseQuick(input: string): Partial<Task> & { title: string } {
  let s = ' ' + input.trim() + ' ';
  let due: string | null = null, dueTime: string | null = null;
  let impact = 3, urgency = 2;

  const bang = s.match(/\s(!{1,3})\s/);
  if (bang) { impact = 4; if (bang[1].length >= 2) urgency = 4; s = s.replace(bang[0], ' '); }

  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => { const m = s.match(re); if (m) { fn(m); s = s.replace(m[0], ' '); } };

  take(/\s(?:at\s)?(\d{1,2})(?::(\d{2}))?\s?(am|pm)\s/i, (m) => {
    let h = +m[1] % 12; if (m[3].toLowerCase() === 'pm') h += 12;
    dueTime = `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`;
  });
  if (!dueTime) take(/\s(?:at\s)?([01]?\d|2[0-3]):([0-5]\d)\s/, (m) => { dueTime = `${m[1].padStart(2, '0')}:${m[2]}`; });

  take(/\s(?:by\s|on\s|due\s)?(today|tonight)\s/i, () => { due = today(); });
  take(/\s(?:by\s|on\s|due\s)?(tomorrow|tmr|tmrw)\s/i, () => { due = addDays(today(), 1); });
  take(/\sin\s(\d{1,3})\s(day|days|week|weeks)\s/i, (m) => { due = addDays(today(), +m[1] * (m[2].startsWith('week') ? 7 : 1)); });
  take(/\s(?:by\s|on\s|due\s)?(next\s)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|sday|urday)?\s/i, (m) => {
    const names = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const want = names.indexOf(m[2].toLowerCase().slice(0, 3));
    const now = new Date().getDay();
    let diff = (want - now + 7) % 7; if (diff === 0) diff = 7; if (m[1]) diff += diff < 7 ? 7 : 0;
    due = addDays(today(), diff);
  });
  take(/\s(\d{4})-(\d{2})-(\d{2})\s/, (m) => { due = `${m[1]}-${m[2]}-${m[3]}`; });
  if (!due) take(/\s(?:by\s|on\s|due\s)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s/, (m) => {
    // day/month (UK/BD style)
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : new Date().getFullYear();
    const d = new Date(y, +m[2] - 1, +m[1]);
    if (!m[3] && d < parseDate(today())) d.setFullYear(y + 1);
    due = toISODate(d);
  });
  if (dueTime && !due) due = today();

  const title = s.replace(/\s+/g, ' ').trim() || input.trim();
  return { title: title.charAt(0).toUpperCase() + title.slice(1), due, dueTime, impact, urgency };
}
