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

export function longToday() {
  const d = new Date();
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}
