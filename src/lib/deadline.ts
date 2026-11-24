import { today, niceDate, niceTime, parseDate, daysBetween } from './dates';

/* Deadlines with an optional time of day ("by Tue 25 Nov, 9:00am").
 * A deadline without a time counts as the end of that day. */

export function deadlineMs(date: string | null | undefined, time?: string | null): number | null {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  if (time) { const [h, mi] = time.split(':').map(Number); return new Date(y, m - 1, d, h, mi).getTime(); }
  return new Date(y, m - 1, d, 23, 59, 59).getTime();
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "Tue 25 Nov · 9am", "Today · 5pm". Deadlines always name the weekday. */
export function deadlineText(date: string | null | undefined, time?: string | null): string {
  if (!date) return '';
  const near = Math.abs(daysBetween(today(), date)) <= 1;
  const d = near ? niceDate(date) : `${DOW[parseDate(date).getDay()]} ${niceDate(date, false)}`;
  return d + (time ? ' · ' + niceTime(time) : '');
}

function span(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${Math.max(1, min)} min`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 24) return m && h < 6 ? `${h} h ${m} min` : `${h} h`;
  const d = Math.floor(h / 24), rh = h % 24;
  return d < 3 && rh ? `${d} day${d === 1 ? '' : 's'} ${rh} h` : `${d} day${d === 1 ? '' : 's'}`;
}

export type Tone = 'over' | 'soon' | 'ok' | '';
/** Time left before the deadline, or how late it is. */
export function countdown(date: string | null | undefined, time?: string | null, done = false, now = Date.now()): { text: string; tone: Tone } {
  const at = deadlineMs(date, time);
  if (at === null || done) return { text: '', tone: '' };
  const left = at - now;
  if (left < 0) {
    if (!time && date === today()) return { text: 'Due today', tone: 'over' };
    return { text: `Overdue by ${span(-left)}`, tone: 'over' };
  }
  if (!time) {
    if (date === today()) return { text: 'Due today', tone: 'soon' };
    const days = Math.round((deadlineMs(date, '12:00')! - deadlineMs(today(), '12:00')!) / 86400000);
    return { text: days === 1 ? 'Due tomorrow' : `in ${days} days`, tone: days <= 2 ? 'soon' : 'ok' };
  }
  return { text: `in ${span(left)}`, tone: left < 3 * 3600_000 ? 'over' : left < 48 * 3600_000 ? 'soon' : 'ok' };
}

export const isOverdue = (date: string | null | undefined, time?: string | null, done = false) => {
  const at = deadlineMs(date, time);
  return !done && at !== null && at < Date.now();
};

/** Quick picks shown in the deadline picker. */
export const QUICK_TIMES: { label: string; value: string }[] = [
  { label: '9 am', value: '09:00' }, { label: '12 pm', value: '12:00' }, { label: '2 pm', value: '14:00' },
  { label: '5 pm', value: '17:00' }, { label: '9 pm', value: '21:00' }, { label: '11:59 pm', value: '23:59' },
];
