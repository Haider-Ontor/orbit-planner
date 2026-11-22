import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project, PlanTask, PlanSub } from '../lib/types';
import { newPlanTask, newPlanSub, taskProgress, stepCounts } from '../lib/models';
import { today, niceDate, daysBetween, addDays, parseDate } from '../lib/dates';
import { Check, Progress } from './ui';
import { Icon } from './icons';

/* A plan = tasks, each with sub-tasks that have deadlines.
 * List view for doing/editing (big touch targets, native date pickers),
 * timeline view for seeing it laid out over time. */

const overdue = (due: string | null, done: boolean) => !!due && !done && due < today();

function DateChip({ value, onChange, placeholder, done }: { value: string | null; onChange: (v: string | null) => void; placeholder: string; done?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const late = done !== undefined && overdue(value, done); // only deadlines turn red, not start dates
  return (
    <label className={'date-chip' + (late ? ' late' : '') + (value ? '' : ' empty')} onClick={(e) => e.stopPropagation()}>
      <span>{value ? niceDate(value) : placeholder}</span>
      <input ref={ref} type="date" value={value ?? ''} aria-label={placeholder} onChange={(e) => onChange(e.target.value || null)} />
    </label>
  );
}

function NameInput({ value, onCommit, placeholder, className, autoFocus }: { value: string; onCommit: (v: string) => void; placeholder: string; className?: string; autoFocus?: boolean }) {
  const [v, setV] = useState(value);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setV(value); }, [value]);
  return (
    <input className={'name-in ' + (className ?? '')} value={v} placeholder={placeholder} autoFocus={autoFocus}
      onFocus={() => { focused.current = true; }}
      onBlur={() => { focused.current = false; if (v.trim() !== value) onCommit(v.trim() || value); }}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setV(value); (e.target as HTMLInputElement).blur(); } }} />
  );
}

export function PlanEditor({ project, onChange, compact }: { project: Project; onChange: (p: Project) => void; compact?: boolean }) {
  const [plan, setPlan] = useState<PlanTask[]>(project.plan);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<'list' | 'timeline'>('list');
  const [newTask, setNewTask] = useState('');
  const [justAdded, setJustAdded] = useState<string | null>(null);

  useEffect(() => { setPlan(project.plan); }, [project.id, project.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (next: PlanTask[]) => { setPlan(next); onChange({ ...project, plan: next }); };
  const upTask = (id: string, p: Partial<PlanTask>) => commit(plan.map((t) => (t.id === id ? { ...t, ...p } : t)));
  const upSub = (tid: string, sid: string, p: Partial<PlanSub>) => commit(plan.map((t) => {
    if (t.id !== tid) return t;
    const subs = t.subs.map((s) => (s.id === sid ? { ...s, ...p } : s));
    return { ...t, subs, done: subs.length ? subs.every((s) => s.done) : t.done };
  }));
  const toggleTask = (t: PlanTask) => {
    const done = !t.done;
    upTask(t.id, { done, subs: t.subs.map((s) => ({ ...s, done })) });
  };
  const addTask = () => {
    const name = newTask.trim();
    if (!name) return;
    const t = newPlanTask({ name });
    commit([...plan, t]);
    setNewTask('');
    setOpen((o) => ({ ...o, [t.id]: true }));
    setJustAdded(t.id);
  };
  const addSub = (t: PlanTask, name: string, due: string | null) => {
    if (!name.trim()) return;
    upTask(t.id, { subs: [...t.subs, newPlanSub({ name: name.trim(), due })], done: false });
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d; if (j < 0 || j >= plan.length) return;
    const next = [...plan]; [next[i], next[j]] = [next[j], next[i]]; commit(next);
  };
  const del = (t: PlanTask) => { if (t.subs.length === 0 || confirm(`Delete "${t.name}" and its ${t.subs.length} sub-task(s)?`)) commit(plan.filter((x) => x.id !== t.id)); };

  const { done, total } = stepCounts({ ...project, plan });
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className={'plan' + (compact ? ' compact' : '')}>
      <div className="plan-head">
        <div style={{ flex: 1, minWidth: 140 }}>
          <div className="small muted" style={{ marginBottom: 5 }}>{total ? `${done} of ${total} steps done · ${pct}%` : 'No steps yet'}</div>
          <Progress value={pct} />
        </div>
        <div className="seg">
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>List</button>
          <button className={view === 'timeline' ? 'on' : ''} onClick={() => setView('timeline')}>Timeline</button>
        </div>
      </div>

      {view === 'timeline' ? (
        <Timeline plan={plan} onPick={(id) => { setView('list'); setOpen((o) => ({ ...o, [id]: true })); }} />
      ) : (
        <div className="plan-list">
          {plan.map((t, i) => {
            const isOpen = !!open[t.id];
            const tp = taskProgress(t);
            return (
              <div key={t.id} className={'ptask' + (t.done ? ' done' : '')}>
                <div className="ptask-row">
                  <Check on={t.done} onClick={() => toggleTask(t)} round label={`Mark ${t.name} done`} />
                  <div className="ptask-main" onClick={() => setOpen((o) => ({ ...o, [t.id]: !isOpen }))}>
                    <div className="ptask-name">{t.name || <span className="muted">Untitled task</span>}</div>
                    <div className="ptask-meta">
                      {t.subs.length > 0 && <span>{t.subs.filter((s) => s.done).length}/{t.subs.length}</span>}
                      {(t.start || t.due) && <span className={overdue(t.due, t.done) ? 'late-text' : ''}>{t.start ? niceDate(t.start) : '…'} → {t.due ? niceDate(t.due) : '…'}</span>}
                    </div>
                    {t.subs.length > 0 && <div className="mini-prog"><i style={{ width: `${tp}%` }} /></div>}
                  </div>
                  <button className="icon-btn" onClick={() => setOpen((o) => ({ ...o, [t.id]: !isOpen }))} aria-label={isOpen ? 'Collapse' : 'Expand'} aria-expanded={isOpen}>
                    <span style={{ display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
                  </button>
                </div>

                {isOpen && (
                  <div className="ptask-body">
                    <NameInput value={t.name} placeholder="Task name" className="task-name-in" autoFocus={justAdded === t.id && !t.name}
                      onCommit={(v) => upTask(t.id, { name: v })} />
                    <div className="row wrap" style={{ gap: 8 }}>
                      <span className="small muted">Start</span>
                      <DateChip value={t.start} placeholder="Set start" onChange={(v) => upTask(t.id, { start: v })} />
                      <span className="small muted">Deadline</span>
                      <DateChip value={t.due} placeholder="Set deadline" done={t.done} onChange={(v) => upTask(t.id, { due: v })} />
                    </div>

                    <div className="subs">
                      {t.subs.map((s) => (
                        <div key={s.id} className={'psub' + (s.done ? ' done' : '')}>
                          <Check on={s.done} onClick={() => upSub(t.id, s.id, { done: !s.done })} label={`Mark ${s.name} done`} />
                          <NameInput value={s.name} placeholder="Sub-task" onCommit={(v) => upSub(t.id, s.id, { name: v })} />
                          <DateChip value={s.due} placeholder="Due" done={s.done} onChange={(v) => upSub(t.id, s.id, { due: v })} />
                          <button className="icon-btn" onClick={() => upTask(t.id, { subs: t.subs.filter((x) => x.id !== s.id) })} aria-label="Delete sub-task"><Icon name="x" size={14} /></button>
                        </div>
                      ))}
                      <AddSub defaultDue={t.due} onAdd={(name, due) => addSub(t, name, due)} />
                    </div>

                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                      <button className="btn sm" onClick={() => move(i, 1)} disabled={i === plan.length - 1} aria-label="Move down">↓</button>
                      <span style={{ flex: 1 }} />
                      <button className="btn sm ghost danger" onClick={() => del(t)}><Icon name="trash" size={14} /> Delete task</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className="add-row">
            <input className="input" placeholder="Add a task…" value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addTask(); }} />
            <button className="btn primary" onClick={addTask} disabled={!newTask.trim()}><Icon name="plus" size={16} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddSub({ onAdd, defaultDue }: { onAdd: (name: string, due: string | null) => void; defaultDue: string | null }) {
  const [name, setName] = useState('');
  const [due, setDue] = useState<string | null>(null);
  const go = () => { if (!name.trim()) return; onAdd(name, due); setName(''); setDue(null); };
  return (
    <div className="psub add">
      <span className="plus-dot"><Icon name="plus" size={13} /></span>
      <input className="name-in" placeholder="Add sub-task…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go(); }} />
      <DateChip value={due} placeholder="Due" done={false} onChange={setDue} />
      <button className="btn sm primary" onClick={go} disabled={!name.trim()}>Add</button>
    </div>
  );
}

/* ---------- timeline ---------- */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function Timeline({ plan, onPick }: { plan: PlanTask[]; onPick: (id: string) => void }) {
  const range = useMemo(() => {
    const dates: string[] = [];
    for (const t of plan) { if (t.start) dates.push(t.start); if (t.due) dates.push(t.due); for (const s of t.subs) if (s.due) dates.push(s.due); }
    if (!dates.length) return null;
    dates.sort();
    let a = dates[0], b = dates[dates.length - 1];
    if (today() < a && daysBetween(today(), a) < 14) a = today();
    if (today() > b && daysBetween(b, today()) < 14) b = today();
    return { a, b, days: Math.max(1, daysBetween(a, b) + 1) };
  }, [plan]);

  if (!range) return <div className="empty" style={{ padding: 20 }}>Give tasks a start date and deadline (or sub-tasks a due date) to see them on the timeline.</div>;

  const pos = (d: string) => (daysBetween(range.a, d) / range.days) * 100;
  const width = (a: string, b: string) => ((daysBetween(a, b) + 1) / range.days) * 100;
  const todayPos = daysBetween(range.a, today()) >= 0 && daysBetween(today(), range.b) >= 0 ? pos(today()) + 50 / range.days : null;

  // up to 4 evenly spaced date labels (fits a phone screen)
  const n = Math.min(4, range.days);
  const ticks = Array.from(new Set(Array.from({ length: n }, (_, i) => addDays(range.a, Math.round((i * (range.days - 1)) / Math.max(1, n - 1))))));

  return (
    <div className="tl">
      <div className="tl-axis">
        {ticks.map((d, i) => {
          const dt = parseDate(d);
          return <span key={i} style={{ left: `${pos(d) + 50 / range.days}%` }}>{dt.getDate()} {MON[dt.getMonth()]}</span>;
        })}
      </div>
      <div className="tl-rows">
        {todayPos !== null && <div className="tl-today" style={{ left: `${todayPos}%` }} />}
        {plan.map((t) => {
          const subDates = t.subs.filter((s) => s.due).map((s) => s.due!).sort();
          const start = t.start ?? subDates[0] ?? t.due;
          const end = t.due ?? subDates[subDates.length - 1] ?? t.start;
          const tp = taskProgress(t);
          return (
            <button key={t.id} className={'tl-row' + (t.done ? ' done' : '')} onClick={() => onPick(t.id)}>
              <div className="tl-name"><span>{t.name || 'Untitled task'}</span><b>{tp}%</b></div>
              <div className="tl-track">
                {start && end && (
                  <div className={'tl-bar' + (overdue(end, t.done) ? ' late' : '')} style={{ left: `${pos(start < end ? start : end)}%`, width: `${width(start < end ? start : end, start < end ? end : start)}%` }}>
                    <i style={{ width: `${tp}%` }} />
                  </div>
                )}
                {t.subs.filter((s) => s.due).map((s) => (
                  <span key={s.id} className={'tl-dot' + (s.done ? ' done' : overdue(s.due, false) ? ' late' : '')}
                    style={{ left: `${pos(s.due!) + 50 / range.days}%` }} title={`${s.name} · ${niceDate(s.due)}`} />
                ))}
              </div>
            </button>
          );
        })}
      </div>
      <div className="tl-legend small muted">
        <span><span className="tl-dot done" /> done</span>
        <span><span className="tl-dot" /> to do</span>
        <span><span className="tl-dot late" /> overdue</span>
        <span><span className="tl-today-key" /> today</span>
        <span>· tap a task to edit</span>
      </div>
    </div>
  );
}
