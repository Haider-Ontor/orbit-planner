import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTasks, useProjects, useRoutines, useGoals } from '../lib/hooks';
import { db, restore } from '../lib/db';
import { completions, KIND_ICON, KIND_LABEL, type DoneItem } from '../lib/history';
import { today, addDays, mondayOf, parseDate, niceTime, timeOfISO } from '../lib/dates';
import { ViewHead, toast } from '../components/ui';
import type { SyncKind, Task } from '../lib/types';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayLabel = (d: string) => {
  const t = today();
  const dt = parseDate(d);
  const base = `${DOW[dt.getDay()]} ${dt.getDate()} ${MON[dt.getMonth()]}`;
  return d === t ? `Today · ${base}` : d === addDays(t, -1) ? `Yesterday · ${base}` : base;
};

export function History({ open }: { open: (t: Task) => void }) {
  const [tab, setTab] = useState<'done' | 'deleted'>('done');
  return (
    <div className="view" style={{ maxWidth: 860 }}>
      <ViewHead title="Done & history" sub="Everything you finished, day by day. Reopen anything ticked by mistake, or restore what was deleted.">
        <div className="seg">
          <button className={tab === 'done' ? 'on' : ''} onClick={() => setTab('done')}>Completed</button>
          <button className={tab === 'deleted' ? 'on' : ''} onClick={() => setTab('deleted')}>Recently deleted</button>
        </div>
      </ViewHead>
      {tab === 'done' ? <Completed open={open} /> : <Deleted />}
    </div>
  );
}

function Completed({ open }: { open: (t: Task) => void }) {
  const tasks = useTasks();
  const projects = useProjects();
  const routines = useRoutines();
  const goals = useGoals();
  const thisWeek = mondayOf(today());
  const [week, setWeek] = useState(thisWeek);
  const [day, setDay] = useState<string | null>(null);

  const all = useMemo(() => completions(tasks, projects, routines, goals), [tasks, projects, routines, goals]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const inWeek = all.filter((x) => x.day >= week && x.day <= days[6]);
  const counts = days.map((d) => inWeek.filter((x) => x.day === d).length);
  const max = Math.max(1, ...counts);
  const shown = day ? inWeek.filter((x) => x.day === day) : inWeek;
  const groups = Array.from(new Set(shown.map((x) => x.day))).sort().reverse();
  const isCurrent = week === thisWeek;
  const kinds = (['task', 'step', 'routine', 'goal'] as const).map((k) => [k, inWeek.filter((x) => x.kind === k).length] as const).filter(([, n]) => n);

  return (
    <>
      <div className="card week-card">
        <div className="row wrap" style={{ marginBottom: 10 }}>
          <div className="seg">
            <button onClick={() => { setWeek(addDays(week, -7)); setDay(null); }} aria-label="Previous week">‹</button>
            <button className={isCurrent ? 'on' : ''} onClick={() => { setWeek(thisWeek); setDay(null); }}>This week</button>
            <button onClick={() => { setWeek(addDays(week, 7)); setDay(null); }} aria-label="Next week" disabled={isCurrent}>›</button>
          </div>
          <span className="muted small">{parseDate(week).getDate()} {MON[parseDate(week).getMonth()]} – {parseDate(days[6]).getDate()} {MON[parseDate(days[6]).getMonth()]}</span>
          <span style={{ flex: 1 }} />
          <span className="small muted" style={{ whiteSpace: 'nowrap' }}><b style={{ fontSize: 20, color: 'var(--ink)' }}>{inWeek.length}</b> done this week</span>
        </div>
        <div className="week-bars" role="list">
          {days.map((d, i) => (
            <button key={d} role="listitem" className={'wb' + (day === d ? ' on' : '') + (d === today() ? ' today' : '') + (d > today() ? ' future' : '')}
              onClick={() => setDay(day === d ? null : d)} aria-label={`${dayLabel(d)}: ${counts[i]} done`}>
              <span className="wb-n">{counts[i] || ''}</span>
              <span className="wb-bar"><i style={{ height: `${(counts[i] / max) * 100}%` }} /></span>
              <span className="wb-d">{DOW[parseDate(d).getDay()].slice(0, 2)}</span>
            </button>
          ))}
        </div>
        {kinds.length > 0 && <div className="row wrap small muted" style={{ marginTop: 8, gap: 12 }}>{kinds.map(([k, n]) => <span key={k}>{KIND_ICON[k]} {n} {KIND_LABEL[k].toLowerCase()}{n === 1 ? '' : 's'}</span>)}</div>}
        {day && <div className="small" style={{ marginTop: 8 }}>Showing {dayLabel(day)} · <button className="linkish" onClick={() => setDay(null)}>show whole week</button></div>}
      </div>

      {groups.map((d) => (
        <div key={d} className="card" style={{ marginTop: 14 }}>
          <div className="card-h">{dayLabel(d)}<span className="grow" /><span style={{ textTransform: 'none', fontWeight: 600 }}>{shown.filter((x) => x.day === d).length} done</span></div>
          <div className="card-b">{shown.filter((x) => x.day === d).map((x) => <DoneRow key={x.key} x={x} open={open} />)}</div>
        </div>
      ))}
      {!groups.length && <div className="card" style={{ marginTop: 14 }}><div className="empty" style={{ padding: 24 }}>{day ? 'Nothing finished on this day.' : isCurrent ? 'Nothing finished yet this week. Ticked items show up here.' : 'Nothing was finished this week.'}</div></div>}
    </>
  );
}

function DoneRow({ x, open }: { x: DoneItem; open: (t: Task) => void }) {
  return (
    <div className="trow done-row" onClick={() => x.taskRef && open(x.taskRef)} style={{ cursor: x.taskRef ? 'pointer' : 'default' }}>
      <span className={'done-ico k-' + x.kind} aria-hidden="true">{KIND_ICON[x.kind]}</span>
      <div className="t-main">
        <div className="t-title">{x.title || 'Untitled'}</div>
        <div className="t-meta">
          <span className="chip">{KIND_LABEL[x.kind]}</span>
          {x.context && <span className="chip">{x.context}</span>}
          {x.at && <span className="small muted">{niceTime(timeOfISO(new Date(x.at).toISOString()))}</span>}
        </div>
      </div>
      <button className="btn sm" onClick={(e) => { e.stopPropagation(); x.reopen(); }}>Reopen</button>
    </div>
  );
}

/* ---------- recently deleted (kept 30 days on this device) ---------- */
const DEL_TABLES: { kind: SyncKind; label: string }[] = [
  { kind: 'tasks', label: 'To-do' }, { kind: 'goals', label: 'Goal' }, { kind: 'projects', label: 'Project' },
  { kind: 'notes', label: 'Note' }, { kind: 'routines', label: 'Routine' },
];
interface DelRow { kind: SyncKind; label: string; id: string; title: string; when: number }

function Deleted() {
  const rows = useLiveQuery(async () => {
    const since = Date.now() - 30 * 86400_000;
    const out: DelRow[] = [];
    for (const { kind, label } of DEL_TABLES) {
      const recs = (await db[kind].where('deleted').equals(1).toArray()) as unknown as Record<string, unknown>[];
      for (const r of recs) {
        if ((r.updated_at as number) < since) continue;
        if (kind === 'projects' && r.kind === 'goal') continue; // restored together with its goal
        out.push({ kind, label, id: r.id as string, title: (r.title ?? r.name ?? '') as string, when: r.updated_at as number });
      }
    }
    return out.sort((a, b) => b.when - a.when);
  }, [], [] as DelRow[]);

  const undelete = async (r: DelRow) => {
    await restore(r.kind, r.id);
    if (r.kind === 'goals') {
      const g = await db.goals.get(r.id);
      if (g?.projectId) await restore('projects', g.projectId);
    }
    toast(`Restored ${r.title || r.label.toLowerCase()}`);
  };

  return (
    <div className="card">
      <div className="card-b" style={{ padding: 8 }}>
        {rows.map((r) => (
          <div key={r.kind + r.id} className="trow" style={{ alignItems: 'center', cursor: 'default' }}>
            <div className="t-main">
              <div className="t-title">{r.title || <span className="muted">Untitled</span>}</div>
              <div className="t-meta"><span className="chip">{r.label}</span><span className="small muted">Deleted {ago(r.when)}</span></div>
            </div>
            <button className="btn sm primary" onClick={() => undelete(r)}>Restore</button>
          </div>
        ))}
        {!rows.length && <div className="empty">Nothing deleted in the last 30 days.</div>}
      </div>
    </div>
  );
}

function ago(ms: number) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}
