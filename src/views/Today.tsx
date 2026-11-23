import { useEffect, useMemo, useState } from 'react';
import { useTasks, useRoutines, useEvents, useProjects, useGoals } from '../lib/hooks';
import { score, daysLeft, quadrantOf } from '../lib/priority';
import { today, addDays, mondayOf, longToday, niceTime, timeOfISO, dateOfISO, niceDate, daysBetween } from '../lib/dates';
import { isDueOn, streak } from '../lib/recurrence';
import { goalProgress, goalCoversWeek, deadlinesOf, toggleStep, toggleRoutineDay } from '../lib/models';
import { completions, KIND_ICON } from '../lib/history';
import { TaskRow } from '../components/TaskRow';
import { Check, Progress } from '../components/ui';
import { Icon } from '../components/icons';
import { openQuickAdd } from '../components/QuickAdd';
import type { Task, View } from '../lib/viewTypes';

/* Today, as a dashboard: a "control panel" header (gauges, live clock, status
 * LED, a circuit-board backdrop), a 14-day "scope trace" of finished work,
 * then the lists that matter today. */

export function Today({ open, go }: { open: (t: Task) => void; go: (v: View) => void }) {
  const tasks = useTasks();
  const routines = useRoutines();
  const events = useEvents();
  const projects = useProjects();
  const goals = useGoals();
  const pmap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const now = useClock();
  const t0 = today();
  const wk = mondayOf(t0);

  const active = tasks.filter((t) => t.status !== 'done');
  const focus = active.slice().sort((a, b) => score(b) - score(a)).slice(0, 5);
  const overdue = active.filter((t) => (daysLeft(t) ?? 1) < 0);
  const dueToday = active.filter((t) => daysLeft(t) === 0 || (t.start && dateOfISO(t.start) === t0));
  const upcoming = active.filter((t) => { const d = daysLeft(t); return d !== null && d > 0 && d <= 7; }).sort((a, b) => (a.due! < b.due! ? -1 : 1));
  const todaysRoutines = routines.filter((r) => isDueOn(r, t0)).sort((a, b) => (a.time ?? '99').localeCompare(b.time ?? '99'));
  const doneRoutines = todaysRoutines.filter((r) => r.log[t0]).length;
  const todaysEvents = events.filter((e) => dateOfISO(e.start) === t0 && !e.fromOrbit);
  const all = useMemo(() => completions(tasks, projects, routines, goals), [tasks, projects, routines, goals]);
  const finishedToday = all.filter((x) => x.day === t0);
  const steps = deadlinesOf(projects).filter((d) => d.due <= addDays(t0, 7)).slice(0, 6);
  const weekGoals = goals.filter((g) => g.status !== 'dropped' && (g.status === 'active' ? goalCoversWeek(g, wk) || g.weekStart < wk : goalCoversWeek(g, wk)));
  const firstCount = active.filter((t) => quadrantOf(t) === 'first').length;
  const bestStreak = routines.reduce((m, r) => Math.max(m, streak(r)), 0);

  // gauge values
  const todaysTasks = tasks.filter((t) => t.due === t0 || (t.start && dateOfISO(t.start) === t0));
  const tDone = todaysTasks.filter((t) => t.status === 'done').length + doneRoutines;
  const tTotal = todaysTasks.length + todaysRoutines.length;
  const goalAvg = weekGoals.length ? Math.round(weekGoals.reduce((a, g) => a + goalProgress(g, pmap), 0) / weekGoals.length) : 0;
  const trace = Array.from({ length: 14 }, (_, i) => { const d = addDays(t0, i - 13); return { d, n: all.filter((x) => x.day === d).length }; });

  const hour = now.getHours();
  const greet = hour < 5 ? 'Working late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const status = overdue.length
    ? { tone: 'warn', text: `${overdue.length} overdue · needs attention` }
    : dueToday.length ? { tone: 'ok', text: `${dueToday.length} due today · on track` } : { tone: 'ok', text: 'All clear · nothing due today' };

  return (
    <div className="view dash">
      <section className="hero">
        <CircuitBackdrop />
        <div className="hero-l">
          <div className="hero-status"><span className={'led ' + status.tone} />{status.text}</div>
          <h1>{greet}</h1>
          <div className="hero-date">{longToday()}</div>
          <div className="hero-clock" aria-label="Time">{String(now.getHours()).padStart(2, '0')}<span className="blink">:</span>{String(now.getMinutes()).padStart(2, '0')}</div>
          <button className="hero-add" onClick={() => openQuickAdd()}><Icon name="plus" size={16} /> Add a task</button>
        </div>
        <div className="gauges">
          <Gauge label="Today" value={tTotal ? Math.round((tDone / tTotal) * 100) : 0} sub={tTotal ? `${tDone} of ${tTotal} done` : 'nothing due'} onClick={() => go('history')} />
          <Gauge label="Week's goals" value={goalAvg} sub={weekGoals.length ? `${weekGoals.length} goal${weekGoals.length === 1 ? '' : 's'}` : 'none set'} onClick={() => go('goals')} />
          <Gauge label="Repeating" value={todaysRoutines.length ? Math.round((doneRoutines / todaysRoutines.length) * 100) : 0} sub={todaysRoutines.length ? `${doneRoutines} of ${todaysRoutines.length}` : 'none today'} onClick={() => go('routines')} />
        </div>
      </section>

      <div className="kpis">
        <button className={'kpi' + (overdue.length ? ' warn' : '')} onClick={() => go('tasks')}><b>{overdue.length}</b><span>Overdue</span></button>
        <button className="kpi" onClick={() => go('tasks')}><b>{dueToday.length}</b><span>Due today</span></button>
        <button className="kpi" onClick={() => go('matrix')}><b style={{ color: '#e11d48' }}>{firstCount}</b><span>Top priority</span></button>
        <button className="kpi" onClick={() => go('routines')}><b>{bestStreak ? `🔥${bestStreak}` : '–'}</b><span>Best streak (days)</span></button>
      </div>

      <ScopeTrace data={trace} onClick={() => go('history')} />

      <div className="today-grid">
        <div className="stack">
          <div className="card focus-card">
            <div className="card-h">Do next<span className="grow" /><button className="btn ghost sm" onClick={() => openQuickAdd()}><Icon name="plus" size={14} /> Add</button></div>
            <div className="card-b">
              {focus.length ? focus.map((t) => <TaskRow key={t.id} t={t} projects={pmap} onOpen={open} />) : <div className="empty">Nothing waiting. Tap <b>+</b> to add something.</div>}
            </div>
          </div>
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
            <div className="card-h">Coming up this week</div>
            <div className="card-b">{upcoming.length ? upcoming.map((t) => <TaskRow key={t.id} t={t} projects={pmap} onOpen={open} />) : <div className="empty">Nothing else this week.</div>}</div>
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-h">Repeating today · {doneRoutines}/{todaysRoutines.length}<span className="grow" /><button className="btn ghost sm" onClick={() => openQuickAdd({ repeat: true })}><Icon name="plus" size={14} /> Add</button></div>
            <div className="card-b">
              {todaysRoutines.length ? todaysRoutines.map((r) => (
                <div key={r.id} className="trow" style={{ cursor: 'default' }}>
                  <Check on={!!r.log[t0]} onClick={() => toggleRoutineDay(r, t0)} label={`Mark ${r.title} done today`} />
                  <div className="t-main">
                    <div className="t-title" style={r.log[t0] ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : undefined}>{r.title}</div>
                    <div className="t-meta">
                      {r.time && <span className="chip">{niceTime(r.time)}</span>}
                      {streak(r) > 1 && <span className="chip ok">🔥 {streak(r)} days</span>}
                    </div>
                  </div>
                </div>
              )) : <div className="empty">No repeating tasks today. Add things like "water the plants" on the days you choose.</div>}
            </div>
          </div>

          <div className="card">
            <div className="card-h">This week's goals<span className="grow" /><button className="btn ghost sm" onClick={() => go('goals')}>Open</button></div>
            <div className="card-b">
              {weekGoals.length ? weekGoals.map((g) => {
                const pr = goalProgress(g, pmap);
                return (
                  <div key={g.id} className="trow" onClick={() => go('goals')} style={{ flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
                    <div className="row"><span className="t-title" style={{ flex: 1, textDecoration: g.status === 'done' ? 'line-through' : undefined }}>{g.priority === 'high' ? '⭐ ' : ''}{g.title}</span><b className="small" style={{ color: 'var(--accent)' }}>{pr}%</b></div>
                    <Progress value={pr} />
                  </div>
                );
              }) : <div className="empty">No goals this week. <button className="btn sm" onClick={() => go('goals')}>Set a goal</button></div>}
            </div>
          </div>

          {todaysEvents.length > 0 && (
            <div className="card">
              <div className="card-h">Calendar<span className="grow" /><button className="btn ghost sm" onClick={() => go('calendar')}>Open</button></div>
              <div className="card-b">
                {todaysEvents.map((e) => (
                  <div key={e.id} className="ev"><span className="tm">{e.allDay ? 'All day' : niceTime(timeOfISO(e.start))}</span><span className="bar" /><span>{e.summary}</span></div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-h">Done today · {finishedToday.length}<span className="grow" /><button className="btn ghost sm" onClick={() => go('history')}>History</button></div>
            <div className="card-b">
              {finishedToday.length ? finishedToday.map((x) => (
                <div key={x.key} className="trow done-row" style={{ alignItems: 'center', cursor: 'default' }}>
                  <span className={'done-ico k-' + x.kind} aria-hidden="true">{KIND_ICON[x.kind]}</span>
                  <div className="t-main"><div className="t-title">{x.title}</div>{x.context && <div className="small muted">{x.context}</div>}</div>
                  <button className="btn sm" onClick={() => x.reopen()}>Reopen</button>
                </div>
              )) : <div className="empty">Things you finish today stay listed here.</div>}
            </div>
          </div>
        </div>
      </div>
      <button className="fab" aria-label="Add" onClick={() => openQuickAdd()}>+</button>
    </div>
  );
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15_000); return () => clearInterval(t); }, []);
  return now;
}

/** Analog-meter style gauge: 270° arc with tick marks. */
function Gauge({ label, value, sub, onClick }: { label: string; value: number; sub: string; onClick: () => void }) {
  const r = 38, c = 50;
  const arc = (from: number, to: number) => {
    const p = (a: number) => [c + r * Math.cos((a * Math.PI) / 180), c + r * Math.sin((a * Math.PI) / 180)];
    const [x1, y1] = p(from), [x2, y2] = p(to);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const v = Math.max(0, Math.min(100, value));
  const end = 135 + (270 * v) / 100;
  const ticks = Array.from({ length: 11 }, (_, i) => 135 + i * 27);
  return (
    <button className="gauge" onClick={onClick} aria-label={`${label}: ${v}%, ${sub}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        {ticks.map((a, i) => {
          const rad = (a * Math.PI) / 180;
          return <line key={i} x1={c + 44 * Math.cos(rad)} y1={c + 44 * Math.sin(rad)} x2={c + (i % 5 === 0 ? 48 : 46.5) * Math.cos(rad)} y2={c + (i % 5 === 0 ? 48 : 46.5) * Math.sin(rad)} className="g-tick" />;
        })}
        <path d={arc(135, 405)} className="g-track" />
        {v > 0 && <path d={arc(135, Math.max(end, 136))} className="g-val" />}
        <text x="50" y="52" className="g-num">{v}<tspan className="g-pct">%</tspan></text>
      </svg>
      <span className="g-label">{label}</span>
      <span className="g-sub">{sub}</span>
    </button>
  );
}

/** Oscilloscope-style trace of items finished per day, last 14 days. */
function ScopeTrace({ data, onClick }: { data: { d: string; n: number }[]; onClick: () => void }) {
  const W = 600, H = 90, pad = 8;
  const max = Math.max(3, ...data.map((x) => x.n));
  const pts = data.map((x, i) => [pad + (i * (W - 2 * pad)) / (data.length - 1), H - pad - (x.n / max) * (H - 2 * pad)]);
  const path = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const total = data.reduce((a, x) => a + x.n, 0);
  return (
    <button className="scope" onClick={onClick} aria-label={`Finished in the last 14 days: ${total}`}>
      <div className="scope-h"><span><span className="led ok" /> Finished · last 14 days</span><b>{total}</b></div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={`${path} L${W - pad},${H - pad} L${pad},${H - pad} Z`} className="scope-fill" />
        <path d={path} className="scope-line" />
        {pts.map(([x, y], i) => data[i].n > 0 && <circle key={i} cx={x} cy={y} r={3} className="scope-pt" />)}
      </svg>
      <div className="scope-x"><span>{niceDate(data[0].d)}</span><span>Today</span></div>
    </button>
  );
}

/** Decorative PCB traces with vias behind the header. */
function CircuitBackdrop() {
  return (
    <svg className="pcb" viewBox="0 0 400 200" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
      <g className="trace">
        <path d="M400 30 H300 L280 50 H210 L195 65 V110" />
        <path d="M400 70 H330 L315 85 V140 L300 155 H240" />
        <path d="M400 120 H360 L345 135 V185" />
        <path d="M400 165 H380 L370 175 H300 L285 190 H180" />
        <path d="M260 0 V20 L250 30 H220" />
        <path d="M150 200 V170 L165 155 H230" />
      </g>
      <g className="via">
        <circle cx="195" cy="110" r="4" /><circle cx="240" cy="155" r="4" /><circle cx="345" cy="185" r="4" />
        <circle cx="180" cy="190" r="4" /><circle cx="220" cy="30" r="4" /><circle cx="230" cy="155" r="4" />
      </g>
      <rect className="chip-ic" x="300" y="95" width="46" height="30" rx="3" />
      {[0, 1, 2, 3].map((i) => <line key={i} className="pin" x1={306 + i * 11} y1="91" x2={306 + i * 11} y2="95" />)}
      {[0, 1, 2, 3].map((i) => <line key={'b' + i} className="pin" x1={306 + i * 11} y1="125" x2={306 + i * 11} y2="129" />)}
    </svg>
  );
}
