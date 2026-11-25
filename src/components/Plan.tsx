import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project, PlanTask, PlanSub, Member } from '../lib/types';
import { newPlanTask, newPlanSub, taskProgress, stepCounts, prioRank } from '../lib/models';
import { PriorityPick, PrioDot, Avatar, MemberSelect, prioLabel } from './StepBits';
import { today, niceDate, daysBetween, addDays, parseDate } from '../lib/dates';
import { Check, Progress, toast } from './ui';
import { doneMsg } from '../lib/undo';
import { Icon } from './icons';
import { DeadlineChip } from './DeadlinePicker';
import { DateField } from './DateTime';
import { isOverdue, countdown, deadlineText, deadlineMs } from '../lib/deadline';

/* A plan = tasks, each with sub-tasks that have deadlines and a priority.
 * List view for doing/editing (big touch targets), timeline view for seeing
 * it laid out over time. With `members` (group work) each task is assigned to
 * a person and has a progress bar you can set by hand. */

const overdue = (due: string | null, done: boolean, time?: string | null) => isOverdue(due, time, done);
/** When a task must be finished: its own deadline, else its last sub-task deadline. */
const taskEnd = (t: PlanTask) => t.due ? deadlineMs(t.due, t.dueTime) : Math.max(0, ...t.subs.map((s) => deadlineMs(s.due, s.dueTime) ?? 0)) || null;

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

export function PlanEditor({ project, onChange, compact, week, members, filter }: {
  project: Project; onChange: (p: Project) => void; compact?: boolean; week?: string;
  members?: Member[];      // group work: who tasks can be assigned to
  filter?: string | null;  // group work: show only this member's work ('none' = not assigned)
}) {
  const [plan, setPlan] = useState<PlanTask[]>(project.plan);
  const group = !!members;
  const memberOf = (t: PlanTask) => members?.find((m) => m.id === t.assignee) ?? null;
  const shownPlan = !group || !filter ? plan : plan.filter((t) => (filter === 'none' ? !memberOf(t) : t.assignee === filter));
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<'list' | 'timeline'>('list');
  const [newTask, setNewTask] = useState('');
  const [justAdded, setJustAdded] = useState<string | null>(null);

  useEffect(() => { setPlan(project.plan); }, [project.id, project.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  const latest = useRef(project);
  latest.current = project;

  const commit = (next: PlanTask[]) => { setPlan(next); onChange({ ...latest.current, plan: next }); };
  /** Commit and offer Undo back to the plan as it was before this change. */
  const commitUndo = (next: PlanTask[], msg: string) => {
    const before = plan;
    commit(next);
    toast(msg, false, { label: 'Undo', run: () => commit(before) });
  };
  const upTask = (id: string, p: Partial<PlanTask>) => commit(plan.map((t) => (t.id === id ? { ...t, ...p } : t)));
  const upSub = (tid: string, sid: string, p: Partial<PlanSub>) => commit(plan.map((t) => {
    if (t.id !== tid) return t;
    const subs = t.subs.map((s) => (s.id === sid ? { ...s, ...p } : s));
    return { ...t, subs, done: subs.length ? subs.every((s) => s.done) : t.done };
  }));
  const toggleSub = (t: PlanTask, s: PlanSub) => {
    const done = !s.done;
    const now = Date.now();
    commitUndo(plan.map((x) => {
      if (x.id !== t.id) return x;
      const subs = x.subs.map((y) => (y.id === s.id ? { ...y, done, doneAt: done ? now : null } : y));
      const all = subs.every((y) => y.done);
      return { ...x, subs, done: all, doneAt: all ? (x.doneAt ?? now) : null };
    }), doneMsg(s.name, done));
  };
  const toggleTask = (t: PlanTask) => {
    const done = !t.done;
    const now = Date.now();
    // Ticking a task finishes its open sub-tasks; unticking reopens only the task itself.
    const subs = done ? t.subs.map((s) => (s.done ? s : { ...s, done: true, doneAt: now })) : t.subs;
    commitUndo(plan.map((x) => (x.id === t.id ? { ...x, done, doneAt: done ? now : null, subs } : x)), doneMsg(t.name, done));
  };
  const [newWho, setNewWho] = useState<string | null>(null);
  useEffect(() => { setNewWho(filter && filter !== 'none' ? filter : null); }, [filter]);
  const addTask = () => {
    const name = newTask.trim();
    if (!name) return;
    const t = newPlanTask({ name, ...(group ? { assignee: newWho, progress: 0 } : {}) });
    commit([...plan, t]);
    setNewTask('');
    setOpen((o) => ({ ...o, [t.id]: true }));
    setJustAdded(t.id);
  };
  const addSub = (t: PlanTask, name: string, due: string | null, dueTime: string | null) => {
    if (!name.trim()) return;
    upTask(t.id, { subs: [...t.subs, newPlanSub({ name: name.trim(), due, dueTime })], done: false });
  };
  // Sort by deadline (soonest first, then priority) or by priority (then deadline).
  const byDl = (a: number | null, b: number | null) => (a ?? Infinity) - (b ?? Infinity);
  const sortPlan = (how: 'deadline' | 'priority') => {
    const cmpT = (a: PlanTask, b: PlanTask) => how === 'deadline'
      ? byDl(taskEnd(a), taskEnd(b)) || prioRank(a.priority) - prioRank(b.priority)
      : prioRank(a.priority) - prioRank(b.priority) || byDl(taskEnd(a), taskEnd(b));
    const cmpS = (a: PlanSub, b: PlanSub) => how === 'deadline'
      ? byDl(deadlineMs(a.due, a.dueTime), deadlineMs(b.due, b.dueTime)) || prioRank(a.priority) - prioRank(b.priority)
      : prioRank(a.priority) - prioRank(b.priority) || byDl(deadlineMs(a.due, a.dueTime), deadlineMs(b.due, b.dueTime));
    commitUndo([...plan].sort(cmpT).map((t) => ({ ...t, subs: [...t.subs].sort(cmpS) })), how === 'deadline' ? 'Sorted by deadline' : 'Sorted by priority');
  };
  const canSort = plan.length >= 2 || plan.some((t) => t.subs.length >= 2);
  const move = (t: PlanTask, d: -1 | 1) => {
    // move within what is shown (a filtered list skips other people's work)
    const k = shownPlan.indexOf(t), other = shownPlan[k + d];
    if (!other) return;
    const i = plan.indexOf(t), j = plan.indexOf(other);
    const next = [...plan]; [next[i], next[j]] = [next[j], next[i]]; commit(next);
  };
  const del = (t: PlanTask) => commitUndo(plan.filter((x) => x.id !== t.id), `Deleted ${t.name || 'task'}${t.subs.length ? ` and ${t.subs.length} sub-task(s)` : ''}`);
  const delSub = (t: PlanTask, s: PlanSub) => commitUndo(plan.map((x) => (x.id === t.id ? { ...x, subs: x.subs.filter((y) => y.id !== s.id) } : x)), `Deleted ${s.name || 'sub-task'}`);

  const { done, total } = stepCounts({ ...project, plan: shownPlan });
  const pct = shownPlan.length ? Math.round(shownPlan.reduce((a, t) => a + taskProgress(t) * Math.max(1, t.subs.length), 0) / shownPlan.reduce((a, t) => a + Math.max(1, t.subs.length), 0)) : 0;

  return (
    <div className={'plan' + (compact ? ' compact' : '')}>
      <div className="plan-head">
        <div style={{ flex: 1, minWidth: 140 }}>
          <div className="small muted" style={{ marginBottom: 5 }}>{total ? `${done} of ${total} steps done · ${pct}%` : 'No steps yet'}</div>
          <Progress value={pct} />
        </div>
        {view === 'list' && canSort && (
          <label className="btn sm sort-pick" data-tip="Put the tasks (and their sub-tasks) in order: soonest deadline first, or most urgent priority first. You can undo.">
            <Icon name="sort" size={14} /> Sort
            <select value="" aria-label="Sort tasks" onChange={(e) => { if (e.target.value) sortPlan(e.target.value as 'deadline' | 'priority'); }}>
              <option value="">Sort…</option>
              <option value="deadline">By deadline</option>
              <option value="priority">By priority</option>
            </select>
          </label>
        )}
        <div className="seg">
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')} data-tip="Tasks and their sub-tasks as a checklist. Tap a task to open it.">List</button>
          <button className={view === 'timeline' ? 'on' : ''} onClick={() => setView('timeline')} data-tip="The same tasks laid out on a timeline by date, with today marked.">Timeline</button>
        </div>
      </div>

      {view === 'timeline' ? (
        <Timeline plan={shownPlan} members={members} onPick={(id) => { setView('list'); setOpen((o) => ({ ...o, [id]: true })); }} />
      ) : (
        <div className="plan-list">
          {group && !shownPlan.length && <div className="empty" style={{ padding: 16 }}>{filter ? 'No work here yet. Add some below.' : 'No work yet. Add the first piece of work below and choose who does it.'}</div>}
          {shownPlan.map((t, i) => {
            const isOpen = !!open[t.id];
            const tp = taskProgress(t);
            const cd = countdown(t.due, t.dueTime, t.done);
            const who = memberOf(t);
            return (
              <div key={t.id} className={'ptask' + (t.done ? ' done' : '')}>
                <div className="ptask-row">
                  <Check on={t.done} onClick={() => toggleTask(t)} round label={`Mark ${t.name} done`} />
                  <div className="ptask-main" onClick={() => setOpen((o) => ({ ...o, [t.id]: !isOpen }))}>
                    <div className="ptask-name">{t.name || <span className="muted">Untitled task</span>}</div>
                    <div className="ptask-meta">
                      {group && <span className="who"><Avatar m={who} size={18} /> {who ? who.name : 'Not assigned'}</span>}
                      {t.priority && <span className="who"><PrioDot value={t.priority} /> {prioLabel(t.priority)}</span>}
                      {t.subs.length > 0 && <span>{t.subs.filter((s) => s.done).length}/{t.subs.length}</span>}
                      {group && !t.subs.length && !t.done && <span>{tp}%</span>}
                      {t.due ? <span className={cd.tone === 'over' ? 'late-text' : ''}>{t.start ? `${niceDate(t.start)} → ` : 'By '}{t.start ? deadlineText(t.due, t.dueTime) : deadlineText(t.due, t.dueTime).replace(/^(Today|Tomorrow|Yesterday)/, (x) => x.toLowerCase())}</span>
                        : t.start ? <span>From {niceDate(t.start)}</span> : null}
                      {cd.text && <span className={'cd ' + cd.tone}>{cd.text}</span>}
                    </div>
                    {(t.subs.length > 0 || group) && <div className="mini-prog"><i style={{ width: `${tp}%`, ...(who ? { background: `var(--m${who.color % 8})` } : {}) }} /></div>}
                  </div>
                  <button className="icon-btn" onClick={() => setOpen((o) => ({ ...o, [t.id]: !isOpen }))} aria-label={isOpen ? 'Collapse' : 'Expand'} aria-expanded={isOpen}>
                    <span style={{ display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>›</span>
                  </button>
                </div>

                {isOpen && (
                  <div className="ptask-body">
                    <NameInput value={t.name} placeholder="Task name" className="task-name-in" autoFocus={justAdded === t.id && !t.name}
                      onCommit={(v) => upTask(t.id, { name: v })} />
                    <div className="pt-fields">
                      {group && (<>
                        <span className="pt-l">Who</span>
                        <span className="pt-v"><MemberSelect members={members!} value={t.assignee} onChange={(id) => upTask(t.id, { assignee: id })} /></span>
                      </>)}
                      <span className="pt-l">Deadline</span>
                      <span className="pt-v"><DeadlineChip date={t.due} time={t.dueTime} done={t.done} week={week} name={t.name} placeholder="Set deadline"
                        onChange={(d, tm) => upTask(t.id, { due: d, dueTime: tm })} /></span>
                      <span className="pt-l">Start</span>
                      <span className="pt-v"><DateField value={t.start} onChange={(v) => upTask(t.id, { start: v })} label={`Start of ${t.name || 'task'} (optional)`} size="sm"
                        tip="When you plan to start (optional). Type the date or open the calendar. With a start and a deadline it shows as a bar on the Timeline." /></span>
                      <span className="pt-l">Priority</span>
                      <span className="pt-v"><PriorityPick value={t.priority} name={t.name} onChange={(v) => upTask(t.id, { priority: v })} /></span>
                      {group && (<>
                        <span className="pt-l">Progress</span>
                        {t.subs.length ? (
                          <span className="pt-v small muted"><b>{tp}%</b>&nbsp;from its sub-tasks below</span>
                        ) : (
                          <span className="pt-v prog-set" data-tip="How far along this work is. Drag it as they report progress; 100% marks it done. Add sub-tasks instead to track it step by step.">
                            <input type="range" min={0} max={100} step={10} value={t.done ? 100 : t.progress ?? 0} aria-label={`Progress of ${t.name}`}
                              style={{ accentColor: who ? `var(--m${who.color % 8})` : 'var(--navy)' }}
                              onChange={(e) => { const v = +e.target.value; upTask(t.id, { progress: v, done: v >= 100, doneAt: v >= 100 ? (t.doneAt ?? Date.now()) : null }); }} />
                            <b className="tnum">{t.done ? 100 : t.progress ?? 0}%</b>
                          </span>
                        )}
                      </>)}
                    </div>

                    <div className="subs">
                      {t.subs.map((s) => (
                        <div key={s.id} className={'psub' + (s.done ? ' done' : '')}>
                          <Check on={s.done} onClick={() => toggleSub(t, s)} label={`Mark ${s.name} done`} />
                          <NameInput value={s.name} placeholder="Sub-task" onCommit={(v) => upSub(t.id, s.id, { name: v })} />
                          <span className="psub-meta">
                            <DeadlineChip date={s.due} time={s.dueTime} done={s.done} week={week} name={s.name} placeholder="Due"
                              onChange={(d, tm) => upSub(t.id, s.id, { due: d, dueTime: tm })} />
                            <PriorityPick value={s.priority} name={s.name} onChange={(v) => upSub(t.id, s.id, { priority: v })} />
                          </span>
                          <button className="icon-btn" onClick={() => delSub(t, s)} aria-label="Delete sub-task"><Icon name="x" size={14} /></button>
                        </div>
                      ))}
                      <AddSub week={week} onAdd={(name, due, tm) => addSub(t, name, due, tm)} />
                    </div>

                    <div className="row" style={{ gap: 6 }}>
                      <button className="btn sm" onClick={() => move(t, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                      <button className="btn sm" onClick={() => move(t, 1)} disabled={i === shownPlan.length - 1} aria-label="Move down">↓</button>
                      <span style={{ flex: 1 }} />
                      <button className="btn sm ghost danger" onClick={() => del(t)}><Icon name="trash" size={14} /> Delete task</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div className={'add-row' + (group ? ' with-who' : '')}>
            <input className="input" placeholder={group ? 'Add a piece of work…' : 'Add a task…'} value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addTask(); }} />
            {group && <MemberSelect members={members!} value={newWho} onChange={setNewWho} label="Assign the new work to" />}
            <button className="btn primary" onClick={addTask} disabled={!newTask.trim()} aria-label="Add"><Icon name="plus" size={16} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddSub({ onAdd, week }: { onAdd: (name: string, due: string | null, time: string | null) => void; week?: string }) {
  const [name, setName] = useState('');
  const [due, setDue] = useState<{ d: string | null; t: string | null }>({ d: null, t: null });
  const go = () => { if (!name.trim()) return; onAdd(name, due.d, due.t); setName(''); setDue({ d: null, t: null }); };
  return (
    <div className="psub add">
      <span className="plus-dot"><Icon name="plus" size={13} /></span>
      <input className="name-in" placeholder="Add sub-task…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') go(); }} />
      <DeadlineChip date={due.d} time={due.t} week={week} name={name.trim() || 'new sub-task'} placeholder="Due" showCountdown={false} onChange={(d, t) => setDue({ d, t })} />
      <button className="btn sm primary" onClick={go} disabled={!name.trim()}>Add</button>
    </div>
  );
}

/* ---------- timeline ---------- */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function Timeline({ plan, onPick, members }: { plan: PlanTask[]; onPick: (id: string) => void; members?: Member[] }) {
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
          const who = members?.find((m) => m.id === t.assignee) ?? null;
          const late = overdue(end, t.done, t.due ? t.dueTime : null);
          return (
            <button key={t.id} className={'tl-row' + (t.done ? ' done' : '')} onClick={() => onPick(t.id)}>
              <div className="tl-name">{members && <Avatar m={who} size={18} />}<span>{t.name || 'Untitled task'}</span><b>{tp}%</b></div>
              <div className="tl-track">
                {start && end && (
                  <div className={'tl-bar' + (late ? ' late' : '')} style={{ left: `${pos(start < end ? start : end)}%`, width: `${width(start < end ? start : end, start < end ? end : start)}%`, ...(who && !late ? { borderColor: `var(--m${who.color % 8})` } : {}) }}>
                    <i style={{ width: `${tp}%`, ...(who && !late ? { background: `var(--m${who.color % 8})` } : {}) }} />
                  </div>
                )}
                {t.subs.filter((s) => s.due).map((s) => (
                  <span key={s.id} className={'tl-dot' + (s.done ? ' done' : overdue(s.due, false, s.dueTime) ? ' late' : '')}
                    style={{ left: `${pos(s.due!) + 50 / range.days}%` }} title={`${s.name} · ${deadlineText(s.due, s.dueTime)}`} />
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
