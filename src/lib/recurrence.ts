import type { Routine } from './types';
import { parseDate, daysBetween, addDays, today } from './dates';

export function isDueOn(r: Routine, date: string): boolean {
  if (r.archived || r.deleted) return false;
  if (daysBetween(r.startDate, date) < 0) return false;
  const dow = parseDate(date).getDay();
  switch (r.freq) {
    case 'daily': return true;
    case 'weekdays': return dow >= 1 && dow <= 5;
    case 'weekly': return r.days.includes(dow);
    case 'interval': return daysBetween(r.startDate, date) % Math.max(1, r.every) === 0;
  }
}

/** Consecutive scheduled occurrences completed, counting back from today
 *  (today only breaks the streak once it is over). */
export function streak(r: Routine): number {
  let n = 0;
  let d = today();
  if (isDueOn(r, d) && !r.log[d]) d = addDays(d, -1);
  for (let i = 0; i < 730; i++) {
    if (isDueOn(r, d)) {
      if (r.log[d]) n++;
      else break;
    }
    d = addDays(d, -1);
    if (daysBetween(r.startDate, d) < 0) break;
  }
  return n;
}

/** Completion rate over the last `days` scheduled occurrences window. */
export function completionRate(r: Routine, days = 30): number {
  let due = 0, done = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(today(), -i);
    if (isDueOn(r, d)) { due++; if (r.log[d]) done++; }
  }
  return due ? done / due : 0;
}

export function describe(r: Routine): string {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  switch (r.freq) {
    case 'daily': return 'Every day';
    case 'weekdays': return 'Weekdays';
    case 'weekly': return r.days.length ? r.days.slice().sort().map((d) => names[d]).join(', ') : 'Weekly';
    case 'interval': return `Every ${r.every} days`;
  }
}
