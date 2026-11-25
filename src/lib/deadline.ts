import { today, niceDate, niceTime, parseDate, daysBetween, addDays } from './dates';

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

/* ---------- typed deadlines: "fri 5pm", "28/11 9:30", "yesterday", "25 nov 2026" ---------- */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYNAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const p2 = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => {
  const x = new Date(y, m - 1, d);
  return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d ? `${y}-${p2(m)}-${p2(d)}` : null;
};
/** A day and month without a year: this year, unless that is more than ~6 months away. */
const nearYear = (m: number, d: number) => {
  const y = new Date().getFullYear();
  const here = iso(y, m, d);
  if (!here) return null;
  const diff = daysBetween(today(), here);
  return diff < -183 ? iso(y + 1, m, d) : diff > 183 ? iso(y - 1, m, d) : here;
};

/** Read a typed day and/or time. Past dates are fine. Returns null if it can't
 *  make sense of the text. A time on its own means today. */
export function parseWhen(input: string): { date: string; time: string | null } | null {
  let s = ' ' + input.toLowerCase().replace(/[,]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  if (!s.trim()) return null;
  let date: string | null = null, time: string | null = null;
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean | void) => {
    const m = s.match(re);
    if (m && fn(m) !== false) s = s.replace(m[0], ' ');
  };
  const t0 = today();

  // ---- time
  take(/\s(noon|midday)\s/, () => { time = '12:00'; });
  take(/\s(midnight|end of (?:the )?day|eod)\s/, () => { time = null; date = date ?? t0; });
  take(/\s(?:at\s|@)?(\d{1,2})(?:[:.](\d{2}))?\s?(am|pm|a\.?m\.?|p\.?m\.?)(?=\s)/, (m) => {
    const h = +m[1], mi = m[2] ? +m[2] : 0;
    if (h < 1 || h > 12 || mi > 59) return false;
    time = `${p2((h % 12) + (m[3].startsWith('p') ? 12 : 0))}:${p2(mi)}`;
  });
  if (!time) take(/\s(?:at\s|@)?([01]?\d|2[0-3])[:h]([0-5]\d)(?:\s?(?:hrs|h))?(?=\s)/, (m) => {
    // 24-hour 9:30 / 17:30 / 17h30 (a dot means a date: 12.11 = 12 Nov)
    time = `${p2(+m[1])}:${m[2]}`;
  });

  // "at 9" / "at 14": a bare hour after "at"
  if (!time) take(/\sat\s([01]?\d|2[0-3])(?=\s)/, (m) => { time = `${p2(+m[1])}:00`; });

  // ---- relative days
  take(/\s(?:by\s|on\s|due\s)?(today|tonight)\s/, () => { date = t0; });
  take(/\s(?:by\s|on\s|due\s)?(tomorrow|tmr|tmrw|tomorow)\s/, () => { date = addDays(t0, 1); });
  take(/\s(yesterday|yday)\s/, () => { date = addDays(t0, -1); });
  take(/\s(?:in\s)(\d{1,3})\s?(d|day|days|w|wk|week|weeks)\s/, (m) => { date = addDays(t0, +m[1] * (m[2].startsWith('w') ? 7 : 1)); });
  take(/\s(\d{1,3})\s?(d|day|days|w|wk|week|weeks)\sago\s/, (m) => { date = addDays(t0, -+m[1] * (m[2].startsWith('w') ? 7 : 1)); });

  // ---- weekday: "fri" = the coming one (today counts), "next fri" a week after, "last fri" the one before today
  take(/\s(?:by\s|on\s|due\s)?(next\s|last\s|this\s)?(sun|mon|tue|wed|thu|fri|sat)(?:day|s|sday|nesday|rsday|urday|r|rs)?\s/, (m) => {
    const want = DAYNAMES.indexOf(m[2]);
    const now = parseDate(t0).getDay();
    const ahead = (want - now + 7) % 7;
    if (m[1]?.startsWith('last')) date = addDays(t0, ahead === 0 ? -7 : ahead - 7);
    else if (m[1]?.startsWith('next')) {
      // "next mon" on a Wednesday = the coming Monday (already next week); "next fri" = Friday of next week
      const sundayGap = (7 - now) % 7;
      date = addDays(t0, ahead === 0 || ahead <= sundayGap ? ahead + 7 : ahead);
    } else date = addDays(t0, ahead);
  });

  // ---- absolute dates
  take(/\s(\d{4})-(\d{1,2})-(\d{1,2})\s/, (m) => { const v = iso(+m[1], +m[2], +m[3]); if (!v) return false; date = v; });
  if (!date) take(/\s(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\s/, (m) => {
    // day/month(/year), the way dates are written in the UK and Bangladesh
    const v = m[3] ? iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]) : nearYear(+m[2], +m[1]);
    if (!v) return false; date = v;
  });
  if (!date) take(/\s(\d{1,2})(?:st|nd|rd|th)?\s(?:of\s)?([a-z]{3})[a-z]*(?:\s(\d{4}))?\s/, (m) => {
    const mo = MONTHS.indexOf(m[2]) + 1;
    if (!mo) return false;
    const v = m[3] ? iso(+m[3], mo, +m[1]) : nearYear(mo, +m[1]);
    if (!v) return false; date = v;
  });
  if (!date) take(/\s([a-z]{3})[a-z]*\s(\d{1,2})(?:st|nd|rd|th)?(?:\s(\d{4}))?\s/, (m) => {
    const mo = MONTHS.indexOf(m[1]) + 1;
    if (!mo) return false;
    const v = m[3] ? iso(+m[3], mo, +m[2]) : nearYear(mo, +m[2]);
    if (!v) return false; date = v;
  });

  // anything left over must be filler, otherwise we didn't understand it
  if (s.replace(/\b(by|on|at|due|the|before|until)\b/g, '').trim()) return null;
  if (!date && !time) return null;
  return { date: date ?? t0, time };
}
