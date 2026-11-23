import { useMemo, useState } from 'react';
import { useTasks, useRoutines, useEvents, useProjects, useGoals } from '../lib/hooks';
import { score, daysLeft, quadrantOf, QUADRANTS } from '../lib/priority';
import { today, addDays, mondayOf, longToday, niceTime, timeOfISO, dateOfISO, niceDate, daysBetween } from '../lib/dates';
import { isDueOn, streak } from '../lib/recurrence';
import { save } from '../lib/db';
import { newTask, goalProgress, deadlinesOf, toggleStep, toggleRoutineDay } from '../lib/models';
import { parseQuick } from '../lib/quick';
import { completions, KIND_ICON } from '../lib/history';
import { TaskRow } from '../components/TaskRow';
import { Check, ViewHead, toast, Progress } from '../components/ui';
import { Icon } from '../components/icons';
import type { Task, View } from '../lib/viewTypes';

export function Today({ open, go }: { open: (t: Task) => void; go: (v: View) => void }) {
  const tasks = useTasks();
  const routines = useRoutines();
  const events = useEvents();
  const projects = useProjects();
  const goals = useGoals();
  const pmap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const [quick, setQuick] = useState('');
  const t0 = today();

  const active = tasks.filter((t) => t.status !== 'done');
  const focus = active.slice().sort((a, b) => score(b) - score(a)).slice(0, 5);
  const overdue = active.filter((t) => (daysLeft(t) ?? 1) < 0).sort((a, b) => (a.due! < b.due! ? -1 : 1));
  const dueToday = active.filter((t) => daysLeft(t) === 0 || (t.start && dateOfISO(t.start) === t0));
  const upcoming = active.filter((t) => { const d = daysLeft(t); return d !== null && d > 0 && d <= 7; }).sort((a, b) => (a.due! < b.due! ? -1 : 1));
  const todaysRoutines = routines.filter((r) => isDueOn(r, t0)).sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'));
  const doneRoutines = todaysRoutines.filter((r) => r.log[t0]).length;
  const todaysEvents = events.filter((e) => dateOfISO(e.start) === t0 && !e.fromOrbit);
  const finishedToday = completions(tasks, projects, routines, goals).filter((x) => x.day === t0);
  const doneToday = finishedToday.filter((x) => x.kind !== 'routine').length;
  const firstCount = active.filter((t) => quadrantOf(t) === 'first').length;
  const wk = mondayOf(t0);
  const steps = deadlinesOf(projects).filter((d) => d.due <= addDays(t0, 7)).slice(0, 8);
  const weekGoals = goals.filter((g) => g.status !== 'dropped' && (g.weekStart === wk || (g.status === 'active' && g.weekStart < wk)));

  const add = async () => {
    if (!quick.trim()) return;
    const p = parseQuick(quick);
    await save('tasks', newTask(p));
    setQuick('');
    toast(`Added “${p.title}”${p.due ? ' · ' + niceDate(p.due) : ''}`);
  };

  const greet = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="view">
      <ViewHead title={greet} sub={longToday()}>
        <button className="btn" onClick={() => go('capture')}><Icon name="capture" size={16} /> Paste & extract</button>
      </ViewHead>

      <div className="quick">
        <input className="input" placeholder='Quick add: "Submit form fri 5pm !!" — ! = important, !! = critical'
          value={quick} onChange={(e) => setQuick(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="btn primary" onClick={add}><Icon name="plus" size={16} /> Add</button>
      </div>

      <div className="stat-row">
        <div className="card stat"><div className="n" style={{ color: overdue.length ? 'var(--danger)' : undefined }}>{overdue.length}</div><div className="l">Overdue</div></div>
        <div className="card stat"><div className="n">{dueToday.length}</div><div className="l">Due today</div></div>
        <div className="card stat"><div className="n" style={{ color: 'var(--q1)' }}>{firstCount}</div><div className="l">First priority</div></div>
        <div className="card stat"><div className="n">{doneToday}<span className="muted" style={{ fontSize: 15 }}> · {doneRoutines}/{todaysRoutines.length}</span></div><div className="l">Done today · routines</div></div>
      </div>

      <div className="today-grid">
        <div className="stack">
          <div className="card focus-card">
            <div className="card-h">Do next<span className="grow" /><span className="small muted" style={{ textTransform: 'none', fontWeight: 500 }}>ranked by impact, urgency & deadline</span></div>
            <div className="card-b">
              {focus.length ? focus.map((t) => <TaskRow key={t.id} t={t} projects={pmap} onOpen={open} />) : <div className="empty">Nothing on your plate. Add a task above or paste an email into Capture.</div>}
            </div>
          </div>
          {overdue.length > 0 && (
            <div className="card">
              <div className="card-h" style={{ color: 'var(--danger)' }}>Overdue</div>
              <div className="card-b">{overdue.map((t) => <TaskRow key={t.id} t={t} projects={pmap} onOpen={open} />)}</div>
            </div>
          )}
          {steps.length > 0 && (
            <div className="card steps-due">
              <div className="card-h">Project & goal steps due<span className="grow" /><button className="btn ghost sm" onClick={() => go('projects')}>Projects</button></div>
              <div className="card-b">
                {steps.map((d) => {
                  const p = pmap.get(d.projectId)!;
                  const late = d.due < t0;
                  return (
                    <div key={d.taskId + (d.subId ?? '')} className="trow" onClick={() => go(d.kind === 'goal' ? 'goals' : 'projects')}>
                      <Check on={false} round onClick={() => toggleStep(p, d.taskId, d.subId)} label={`Mark ${d.name} done`} />
                      <div className="t-main">
                        <div className="t-title">{d.name}</div>
                        <div className="t-meta">
                          <span className={'chip ' + (late ? 'over' : d.due === t0 ? 'soon' : '')}>{late ? `${-daysBetween(t0, d.due)}d overdue` : niceDate(d.due)}</span>
                          <span className="chip">{d.kind === 'goal' ? '🎯 ' : ''}{d.projectName}{d.parent && d.parent !== d.projectName ? ` · ${d.parent}` : ''}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="card">
            <div className="card-h">Due today</div>
            <div className="card-b">{dueToday.length ? dueToday.map((t) => <TaskRow key={t.id} t={t} projects={pmap} onOpen={open} />) : <div className="empty">Nothing due today.</div>}</div>
          </div>
          <div className="card">
            <div className="card-h">Next 7 days</div>
            <div className="card-b">{upcoming.length ? upcoming.map((t) => <TaskRow key={t.id} t={t} projects={pmap} onOpen={open} />) : <div className="empty">Clear week ahead.</div>}</div>
          </div>
          <div className="card">
            <div className="card-h">Done today · {finishedToday.length}<span className="grow" /><button className="btn ghost sm" onClick={() => go('history')}>History</button></div>
            <div className="card-b">
              {finishedToday.length ? finishedToday.map((x) => (
                <div key={x.key} className="trow done-row" style={{ alignItems: 'center', cursor: 'default' }}>
                  <span className={'done-ico k-' + x.kind} aria-hidden="true">{KIND_ICON[x.kind]}</span>
                  <div className="t-main"><div className="t-title">{x.title}</div>{x.context && <div className="small muted">{x.context}</div>}</div>
                  <button className="btn sm" onClick={() => x.reopen()}>Reopen</button>
                </div>
              )) : <div className="empty">Things you finish today stay listed here, so a tick is never lost.</div>}
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-h">This week's goals<span className="grow" /><button className="btn ghost sm" onClick={() => go('goals')}>Plan</button></div>
            <div className="card-b">
              {weekGoals.length ? weekGoals.map((g) => {
                const pr = goalProgress(g, pmap);
                return (
                  <div key={g.id} className="trow" onClick={() => go('goals')} style={{ flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
                    <div className="row"><span className="t-title" style={{ flex: 1, textDecoration: g.status === 'done' ? 'line-through' : undefined }}>{g.title}</span><b className="small" style={{ color: 'var(--accent)' }}>{pr}%</b></div>
                    <Progress value={pr} />
                  </div>
                );
              }) : <div className="empty">No goals set for this week. <button className="btn sm" onClick={() => go('goals')}>Set goals</button></div>}
            </div>
          </div>
          <div className="card">
            <div className="card-h">Routines today<span className="grow" /><button className="btn ghost sm" onClick={() => go('routines')}>All</button></div>
            <div className="card-b">
              {todaysRoutines.length ? todaysRoutines.map((r) => (
                <div key={r.id} className="trow" style={{ cursor: 'default' }}>
                  <Check on={!!r.log[t0]} onClick={() => toggleRoutineDay(r, t0)} label={`Mark ${r.title} done today`} />
                  <div className="t-main">
                    <div className="t-title" style={r.log[t0] ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : undefined}>{r.title}</div>
                    <div className="t-meta">
                      {r.time && <span className="chip">{niceTime(r.time)}</span>}
                      <span className="chip">{r.category}</span>
                      {streak(r) > 1 && <span className="chip ok">🔥 {streak(r)}</span>}
                    </div>
                  </div>
                </div>
              )) : <div className="empty">No routines scheduled today.</div>}
            </div>
          </div>

          <div className="card">
            <div className="card-h">Calendar<span className="grow" /><button className="btn ghost sm" onClick={() => go('calendar')}>Agenda</button></div>
            <div className="card-b">
              {todaysEvents.length ? todaysEvents.map((e) => (
                <div key={e.id} className="ev">
                  <span className="tm">{e.allDay ? 'All day' : niceTime(timeOfISO(e.start))}</span>
                  <span className="bar" />
                  <span>{e.summary}{e.location && <span className="muted small"> · {e.location}</span>}</span>
                </div>
              )) : <div className="empty">No events today{events.length ? '' : ' (connect Google Calendar in Settings)'}.</div>}
            </div>
          </div>

          <div className="card">
            <div className="card-h">Matrix snapshot<span className="grow" /><button className="btn ghost sm" onClick={() => go('matrix')}>Open</button></div>
            <div className="card-b" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '4px 14px 14px' }}>
              {(['second', 'first', 'eliminate', 'third'] as const).map((q) => (
                <div key={q} style={{ background: QUADRANTS[q].color, color: QUADRANTS[q].ink, borderRadius: 10, padding: '10px 12px', cursor: 'pointer' }} onClick={() => go('matrix')}>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{active.filter((t) => quadrantOf(t) === q).length}</div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{QUADRANTS[q].label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-h">Tomorrow</div>
            <div className="card-b">
              {(() => {
                const tm = addDays(t0, 1);
                const list = active.filter((t) => t.due === tm);
                return list.length ? list.map((t) => <TaskRow key={t.id} t={t} projects={pmap} onOpen={open} />) : <div className="empty">Nothing due tomorrow.</div>;
              })()}
            </div>
          </div>
        </div>
      </div>
      <button className="fab" aria-label="New task" onClick={() => open(newTask())}>+</button>
    </div>
  );
}

export function toggle(log: Record<string, 1>, d: string): Record<string, 1> {
  const n = { ...log };
  if (n[d]) delete n[d]; else n[d] = 1;
  return n;
}
