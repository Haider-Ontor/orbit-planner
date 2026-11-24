const pad = (n: number) => String(n).padStart(2, '0');

export const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toISODate(new Date());
export const parseDate = (s: string) => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s: string, n: number) => { const d = parseDate(s); d.setDate(d.getDate() + n); return toISODate(d); };
export const daysBetween = (a: string, b: string) => Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);

export function mondayOf(s: string) {
  const d = parseDate(s);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return toISODate(d);
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dowName = (i: number) => DOW[i];

export function niceDate(s: string | null, withDow = true) {
  if (!s) return '';
  const t = today();
  const diff = daysBetween(t, s);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const d = parseDate(s);
  const base = `${d.getDate()} ${MON[d.getMonth()]}`;
  if (diff > 1 && diff < 7 && withDow) return `${DOW[d.getDay()]} ${base}`;
  return d.getFullYear() === new Date().getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

export function niceTime(hhmm: string | null) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'pm' : 'am';
  const hh = h % 12 || 12;
  return m ? `${hh}:${pad(m)}${ap}` : `${hh}${ap}`;
}

export const timeOfISO = (iso: string) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const dateOfISO = (iso: string) => (iso.length <= 10 ? iso : toISODate(new Date(iso)));

/** "This week (24 – 30 Nov)", "Next week (…)", or "Week of 8 Dec". */
export function weekName(monday: string) {
  const thisWeek = mondayOf(today());
  const a = parseDate(monday), b = parseDate(addDays(monday, 6));
  const range = `${a.getDate()}${a.getMonth() === b.getMonth() ? '' : ' ' + MON[a.getMonth()]} – ${b.getDate()} ${MON[b.getMonth()]}`;
  if (monday === thisWeek) return `This week (${range})`;
  if (monday === addDays(thisWeek, 7)) return `Next week (${range})`;
  return `Week of ${a.getDate()} ${MON[a.getMonth()]}`;
}

/* months as "YYYY-MM" */
export const monthOf = (d: string) => d.slice(0, 7);
export const addMonths = (ym: string, n: number) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
export const monthStart = (ym: string) => `${ym}-01`;
export const monthEnd = (ym: string) => { const [y, m] = ym.split('-').map(Number); return toISODate(new Date(y, m, 0)); };
/** "December", or "January 2027" outside this year; "This month" for the current one when asked. */
export function monthName(ym: string, relative = false) {
  const [y, m] = ym.split('-').map(Number);
  if (relative && ym === monthOf(today())) return 'This month';
  if (relative && ym === addMonths(monthOf(today()), 1)) return 'Next month';
  const name = new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long' });
  return y === new Date().getFullYear() ? name : `${name} ${y}`;
}

export function longToday() {
  const d = new Date();
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}
