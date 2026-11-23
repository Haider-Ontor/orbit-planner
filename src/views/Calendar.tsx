import { useMemo, useState } from 'react';
import { useEvents, useTasks, useRoutines } from '../lib/hooks';
import { today, addDays, parseDate, niceTime, timeOfISO, dateOfISO, dowName } from '../lib/dates';
import { isDueOn } from '../lib/recurrence';
import { QUADRANTS, quadrantOf } from '../lib/priority';
import { syncCalendar, gcalConnected } from '../lib/gcal';
import { openLink } from '../lib/platform';
import { ViewHead, toast, errMsg } from '../components/ui';
import { Icon } from '../components/icons';
import type { Task } from '../lib/types';
import type { View } from '../lib/viewTypes';

interface Item { key: string; time: string; label: string; kind: 'event' | 'task' | 'routine'; color: string; onClick?: () => void; sub?: string }

export function Calendar({ open, go }: { open: (t: Task) => void; go: (v: View) => void }) {
  const events = useEvents();
  const tasks = useTasks();
  const routines = useRoutines();
  const [span, setSpan] = useState(14);
  const [busy, setBusy] = useState(false);
  const t0 = today();

  const days = useMemo(() => {
    const out: { date: string; items: Item[] }[] = [];
    for (let i = 0; i < span; i++) {
      const d = addDays(t0, i);
      const items: Item[] = [];
      events.filter((e) => !e.fromOrbit && dateOfISO(e.start) === d).forEach((e) => items.push({
        key: 'e' + e.id, time: e.allDay ? '' : timeOfISO(e.start), label: e.summary, kind: 'event', color: 'var(--navy)',
        sub: e.location, onClick: () => e.htmlLink && openLink(e.htmlLink),
      }));
      tasks.filter((t) => t.status !== 'done' && (t.start ? dateOfISO(t.start) === d : t.due === d)).forEach((t) => items.push({
        key: 't' + t.id, time: t.start ? timeOfISO(t.start) : t.dueTime ?? '', label: t.title, kind: 'task',
        color: QUADRANTS[quadrantOf(t)].color, onClick: () => open(t), sub: t.start ? 'Scheduled' : 'Deadline',
      }));
      routines.filter((r) => isDueOn(r, d)).forEach((r) => items.push({ key: 'r' + r.id, time: r.time ?? '', label: r.title, kind: 'routine', color: 'var(--beige-strong)', sub: 'Routine' }));
      items.sort((a, b) => (a.time || '00:00').localeCompare(b.time || '00:00'));
      out.push({ date: d, items });
    }
    return out;
  }, [events, tasks, routines, span, t0, open]);

  const refresh = async () => {
    setBusy(true);
    try { const m = await syncCalendar(); toast(m || 'Calendar not connected'); } catch (e) { toast(errMsg(e), true); }
    finally { setBusy(false); }
  };

  return (
    <div className="view">
      <ViewHead title="Calendar" sub="Google Calendar events, timed tasks, deadlines and routines in one list.">
        <div className="seg">{[7, 14, 30].map((n) => <button key={n} className={span === n ? 'on' : ''} onClick={() => setSpan(n)}>{n} days</button>)}</div>
        {gcalConnected()
          ? <button className="btn" onClick={refresh} disabled={busy}><Icon name="sync" size={15} /> {busy ? 'Syncing…' : 'Sync Google'}</button>
          : <button className="btn" onClick={() => go('settings')}>Connect Google Calendar</button>}
      </ViewHead>
      <div className="card">
        {days.map(({ date, items }) => {
          const d = parseDate(date);
          return (
            <div key={date} className={'agenda-day' + (date === t0 ? ' is-today' : '')}>
              <div className="d">{date === t0 ? 'Today' : dowName(d.getDay())}<small>{d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</small></div>
              <div>
                {items.length ? items.map((it) => (
                  <div key={it.key} className="ev" style={{ cursor: it.onClick ? 'pointer' : 'default' }} onClick={it.onClick}>
                    <span className="tm">{it.time ? niceTime(it.time) : it.kind === 'task' ? 'Any time' : 'All day'}</span>
                    <span className="bar" style={{ background: it.color }} />
                    <span>{it.label}{it.sub && <span className="muted small"> · {it.sub}</span>}</span>
                  </div>
                )) : <span className="muted small">Free</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
