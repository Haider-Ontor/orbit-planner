import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { useTasks, useRoutines, useEvents, useProjects, useGoals } from '../lib/hooks';
import { score, daysLeft, quadrantOf } from '../lib/priority';
import { today, addDays, mondayOf, niceTime, timeOfISO, dateOfISO, niceDate, parseDate } from '../lib/dates';
import { isDueOn, streak } from '../lib/recurrence';
import { goalProgress, goalCoversWeek, deadlinesOf, toggleStep, toggleRoutineDay, goalDueText, goalDueMode, prioritizedSteps } from '../lib/models';
import { countdown, deadlineText, deadlineMs } from '../lib/deadline';
import { PrioDot, prioLabel } from '../components/StepBits';
import { completions, KIND_ICON } from '../lib/history';
import { TaskRow } from '../components/TaskRow';
import { Check, Progress } from '../components/ui';
import { Icon } from '../components/icons';
import { openQuickAdd } from '../components/QuickAdd';
import type { Task, View } from '../lib/viewTypes';

/* Today: the visual centre of Orbit. Overview (gauges + key numbers), a small
 * activity chart, then Do next first, with secondary lists collapsible. */

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
  const allSteps = deadlinesOf(projects);
  const steps = allSteps.filter((d) => d.due <= addDays(t0, 7)).slice(0, 6);
  const stepsLate = allSteps.filter((d) => d.at < now.getTime()).length;
  const stepsToday = allSteps.filter((d) => d.due === t0 && d.at >= now.getTime()).length;
  const weekGoals = goals.filter((g) => g.status !== 'dropped' && (g.status === 'active' ? goalCoversWeek(g, wk) || g.weekStart < wk : goalCoversWeek(g, wk)))
    .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || (deadlineMs(a.deadline, a.deadlineTime) ?? Infinity) - (deadlineMs(b.deadline, b.deadlineTime) ?? Infinity));
  const firstCount = active.filter((t) => quadrantOf(t) === 'first').length + prioritizedSteps(projects, goals).filter((s) => s.priority === 'first').length;
  const bestStreak = routines.reduce((m, r) => Math.max(m, streak(r)), 0);

  const todaysTasks = tasks.filter((t) => t.due === t0 || (t.start && dateOfISO(t.start) === t0));
  const tDone = todaysTasks.filter((t) => t.status === 'done').length + doneRoutines;
  const tTotal = todaysTasks.length + todaysRoutines.length;
  const goalAvg = weekGoals.length ? Math.round(weekGoals.reduce((a, g) => a + goalProgress(g, pmap), 0) / weekGoals.length) : 0;
  const activity = Array.from({ length: 14 }, (_, i) => { const d = addDays(t0, i - 13); return { d, n: all.filter((x) => x.day === d).length }; });

  const hour = now.getHours();
  const greet = hour < 5 ? 'Working late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const nOver = overdue.length + stepsLate, nToday = dueToday.length + stepsToday;
  const status = nOver
    ? { tone: 'busy', text: `${nOver} overdue · needs attention` }
    : nToday ? { tone: 'ok', text: `${nToday} due today · on track` } : { tone: 'ok', text: 'Nothing due today' };
  const dateLine = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="view dash">
      <header className="dash-head">
        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="dash-eyebrow">{dateLine}</div>
          <h1>{greet}</h1>
          <div className="dash-status">
            <span className={'dot ' + status.tone} />{status.text}
            <span className="muted">·</span>
            <span className="dash-clock">{String(now.getHours()).padStart(2, '0')}:{String(now.getMinutes()).padStart(2, '0')}</span>
          </div>
        </div>
        <button className="btn primary" onClick={() => openQuickAdd()}><Icon name="plus" size={16} /> Add task</button>
      </header>

      <section className="card overview" aria-label="Overview">
        <div className="gauges">
          <Gauge label="Today" value={tTotal ? Math.round((tDone / tTotal) * 100) : 0} sub={tTotal ? `${tDone} of ${tTotal} done` : 'Nothing due'} onClick={() => go('history')}
            tip="How much of today you've ticked off: tasks due today plus today's repeating tasks. Tap to see everything you've finished." />
          <Gauge label="Goals this week" value={goalAvg} sub={weekGoals.length ? `${weekGoals.length} goal${weekGoals.length === 1 ? '' : 's'}` : 'None set'} onClick={() => go('goals')}
            tip="Average progress of the goals open this week. Tap to open Goals." />
          <Gauge label="Repeating" value={todaysRoutines.length ? Math.round((doneRoutines / todaysRoutines.length) * 100) : 0} sub={todaysRoutines.length ? `${doneRoutines} of ${todaysRoutines.length}` : 'None today'} onClick={() => go('routines')}
            tip="Repeating tasks due today that are done (like watering the plants). Tap to manage repeating tasks." />
        </div>
        <div className="stats">
          <button className={'stat' + (nOver ? ' warn' : '')} onClick={() => go(overdue.length || !stepsLate ? 'tasks' : 'goals')} data-tip="Tasks and goal or project steps whose deadline has passed and that aren't done yet."><b>{nOver}</b><span>Overdue</span></button>
          <button className="stat" onClick={() => go(dueToday.length || !stepsToday ? 'tasks' : 'goals')} data-tip="Tasks and goal or project steps due later today (or scheduled for today)."><b>{nToday}</b><span>Due today</span></button>
          <button className="stat" onClick={() => go('matrix')} data-tip="Everything in your Urgent priority group: to-dos that are important and due soon, plus goal and project steps marked Urgent. Tap to open Priorities."><b>{firstCount}</b><span>Urgent</span></button>
          <button className="stat" onClick={() => go('routines')} data-tip="The most days in a row you've kept up a repeating task."><b>{bestStreak || '–'}</b><span>Best streak (days)</span></button>
        </div>
      </section>

      <ActivityChart data={activity} onClick={() => go('history')} />

      <div className="today-grid">
        <div className="stack">
          <div className="card focus-card">
            <div className="card-h"><span data-tip="Your 5 most pressing tasks, ranked by importance and how soon they're due.">Do next</span><span className="grow" /><button className="btn ghost sm" onClick={() => openQuickAdd()}><Icon name="plus" size={14} /> Add</button></div>
            <div className="card-b">
              {focus.length ? focus.map((t) => <TaskRow key={t.id} t={t} projects={pmap} onOpen={open} />) : <div className="empty">Nothing waiting. Add a task to get started.</div>}
            </div>
          </div>

          {steps.length > 0 && (
            <Section id="steps" title="Deadlines coming up" count={steps.length} tip="Steps from your goals and projects that are due in the next 7 days, nearest first, with the time left. Tick one when it's done."
              action={<button className="btn ghost sm" onClick={() => go('projects')}>Projects</button>}>
              {steps.map((d) => {
                const p = pmap.get(d.projectId)!;
                const cd = countdown(d.due, d.dueTime, false, now.getTime());
                return (
                  <div key={d.taskId + (d.subId ?? '')} className="trow" onClick={() => go(d.kind === 'goal' ? 'goals' : d.kind === 'group' ? 'group' : 'projects')}>
                    <Check on={false} round onClick={() => toggleStep(p, d.taskId, d.subId)} label={`Mark ${d.name} done`} />
                    <div className="t-main">
                      <div className="t-title">{d.name}</div>
                      <div className="t-meta">
                        <span className={'chip ' + (cd.tone === 'over' ? 'over' : cd.tone === 'soon' ? 'soon' : '')} data-tip={`Must be done by ${deadlineText(d.due, d.dueTime)}${d.dueTime ? '' : ' (end of day)'}.`}>
                          <Icon name="clock" size={12} /> {deadlineText(d.due, d.dueTime)}{cd.text && !cd.text.startsWith('Due') ? ` · ${cd.text}` : ''}
                        </span>
                        {d.priority && <span className="chip"><PrioDot value={d.priority} /> {prioLabel(d.priority)}</span>}
                        {d.who && <span className="chip" data-tip={`Group work: ${d.who} is doing this.`}><Icon name="users" size={12} /> {d.who}</span>}
                        <span className="chip">{d.projectName}{d.parent && d.parent !== d.projectName ? ` · ${d.parent}` : ''}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </Section>
          )}

          <Section id="upcoming" title="Coming up this week" count={upcoming.length} tip="Tasks due in the next 7 days.">
            {upcoming.length ? upcoming.map((t) => <TaskRow key={t.id} t={t} projects={pmap} onOpen={open} />) : <div className="empty">Nothing else this week.</div>}
          </Section>
        </div>

        <div className="stack">
          <Section id="repeating" title="Repeating today" count={`${doneRoutines}/${todaysRoutines.length}`} tip="Tasks that repeat on set days. Tick them off each day to keep your streak going." action={<button className="btn ghost sm" onClick={() => openQuickAdd({ repeat: true })}><Icon name="plus" size={14} /> Add</button>}>
            {todaysRoutines.length ? todaysRoutines.map((r) => (
              <div key={r.id} className={'trow' + (r.log[t0] ? ' done' : '')} style={{ cursor: 'default' }}>
                <Check on={!!r.log[t0]} onClick={() => toggleRoutineDay(r, t0)} label={`Mark ${r.title} done today`} />
                <div className="t-main">
                  <div className="t-title">{r.title}</div>
                  {(r.time || streak(r) > 1) && (
                    <div className="t-meta">
                      {r.time && <span className="chip">{niceTime(r.time)}</span>}
                      {streak(r) > 1 && <span className="chip ok">{streak(r)}-day streak</span>}
                    </div>
                  )}
                </div>
              </div>
            )) : <div className="empty">No repeating tasks today.</div>}
          </Section>

          <Section id="goals" title="This week's goals" count={weekGoals.length} tip="Goals open this week with their progress, the one due soonest first." action={<button className="btn ghost sm" onClick={() => go('goals')}>Open</button>}>
            {weekGoals.length ? weekGoals.map((g) => {
              const pr = goalProgress(g, pmap);
              const open = g.status === 'active';
              const cd = open && g.deadline ? countdown(g.deadline, g.deadlineTime, false, now.getTime()) : null;
              return (
                <div key={g.id} className={'trow' + (g.status === 'done' ? ' done' : '')} onClick={() => go('goals')} style={{ flexDirection: 'column', gap: 6, alignItems: 'stretch' }}>
                  <div className="row"><span className="t-title" style={{ flex: 1 }}>{g.title}</span>{g.priority === 'high' && <span className="chip soon">Top</span>}<b className="small tnum" style={{ color: 'var(--navy)' }}>{pr}%</b></div>
                  {open && (g.deadline || g.weekStart < wk) && (
                    <div className="t-meta">
                      <span className={'chip ' + (cd?.tone === 'over' || (!g.deadline && g.weekStart < wk) ? 'over' : cd?.tone === 'soon' ? 'soon' : '')}>
                        <Icon name="clock" size={12} /> Due {goalDueText(g)}{cd?.text && goalDueMode(g) !== 'month' && !cd.text.startsWith('Due') ? ` · ${cd.text}` : ''}
                      </span>
                    </div>
                  )}
                  <Progress value={pr} />
                </div>
              );
            }) : <div className="empty">No goals this week. <button className="linkish" onClick={() => go('goals')}>Set a goal</button></div>}
          </Section>

          {todaysEvents.length > 0 && (
            <Section id="calendar" title="Calendar" count={todaysEvents.length} tip="Today's events from your Google Calendar." action={<button className="btn ghost sm" onClick={() => go('calendar')}>Open</button>}>
              {todaysEvents.map((e) => (
                <div key={e.id} className="ev"><span className="tm">{e.allDay ? 'All day' : niceTime(timeOfISO(e.start))}</span><span className="bar" /><span>{e.summary}</span></div>
              ))}
            </Section>
          )}

          <Section id="done" title="Done today" count={finishedToday.length} defaultOpen={false} tip="Everything you finished today. Ticked something by mistake? Reopen it here." action={<button className="btn ghost sm" onClick={() => go('history')}>History</button>}>
            {finishedToday.length ? finishedToday.map((x) => (
              <div key={x.key} className="trow done-row" style={{ alignItems: 'center', cursor: 'default' }}>
                <span className={'done-ico k-' + x.kind} aria-hidden="true">{KIND_ICON[x.kind]}</span>
                <div className="t-main"><div className="t-title">{x.title}</div>{x.context && <div className="small muted">{x.context}</div>}</div>
                <button className="btn sm" onClick={() => x.reopen()}>Reopen</button>
              </div>
            )) : <div className="empty">Things you finish today stay listed here.</div>}
          </Section>
        </div>
      </div>
      <button className="fab" aria-label="Add" onClick={() => openQuickAdd()}>+</button>
    </div>
  );
}

/** Card with a header that folds the body away; remembers its state per section. */
function Section({ id, title, count, action, defaultOpen = true, tip, children }: { id: string; title: string; count?: number | string; action?: ReactNode; defaultOpen?: boolean; tip?: string; children: ReactNode }) {
  const key = 'orbit.today.' + id;
  const [open, setOpen] = useState(() => { try { const v = localStorage.getItem(key); return v === null ? defaultOpen : v === '1'; } catch { return defaultOpen; } });
  const toggle = () => { const n = !open; setOpen(n); try { localStorage.setItem(key, n ? '1' : '0'); } catch { /* ignore */ } };
  return (
    <div className="card">
      <div className="card-h">
        <button className="collapse-h row" style={{ flex: 1, gap: 8, padding: 0, color: 'inherit' }} onClick={toggle} aria-expanded={open} data-tip={tip}>
          <span className="chev" style={{ transform: open ? 'rotate(90deg)' : 'none' }}><ChevronRight size={16} /></span>
          <span>{title}</span>
          {count !== undefined && <span className="count-pill">{count}</span>}
        </button>
        {action}
      </div>
      {open && <div className="card-b">{children}</div>}
    </div>
  );
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15_000); return () => clearInterval(t); }, []);
  return now;
}

/** Minimal ring gauge: beige track, navy value, orange when complete. */
function Gauge({ label, value, sub, onClick, tip }: { label: string; value: number; sub: string; onClick: () => void; tip?: string }) {
  const v = Math.max(0, Math.min(100, value));
  const r = 24, c = 2 * Math.PI * r;
  return (
    <button className="gauge" onClick={onClick} aria-label={`${label}: ${v}%, ${sub}`} data-tip={tip}>
      <svg viewBox="0 0 60 60" aria-hidden="true">
        <circle cx="30" cy="30" r={r} className="g-track" />
        <circle cx="30" cy="30" r={r} className={'g-val' + (v >= 100 ? ' full' : '')} strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} transform="rotate(-90 30 30)" style={{ opacity: v ? 1 : 0 }} />
        <text x="30" y="30" className="g-num">{v}%</text>
      </svg>
      <span className="g-text"><span className="g-label">{label}</span><span className="g-sub">{sub}</span></span>
    </button>
  );
}

/** Items finished per day, last 14 days: navy bars, today in orange, quiet days in beige. */
function ActivityChart({ data, onClick }: { data: { d: string; n: number }[]; onClick: () => void }) {
  const W = 700, H = 74, pad = 2, gap = 8;
  const max = Math.max(3, ...data.map((x) => x.n));
  const bw = (W - pad * 2 - gap * (data.length - 1)) / data.length;
  const total = data.reduce((a, x) => a + x.n, 0);
  const t0 = today();
  return (
    <button className="card activity" onClick={onClick} aria-label={`Finished in the last 14 days: ${total}`}
      data-tip="How many things you finished each day over the last 14 days. Today is orange. Tap for the full history.">
      <div className="activity-h"><h3>Activity</h3><span>items finished · last 14 days</span><b className="tnum">{total}</b></div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} className="a-grid" />)}
        {data.map((x, i) => {
          const h = x.n ? Math.max(4, ((H - 4) * x.n) / max) : 3;
          return <rect key={x.d} x={pad + i * (bw + gap)} y={H - h} width={bw} height={h} rx="2" className={'a-bar' + (x.d === t0 ? ' today' : x.n ? '' : ' zero')}><title>{`${niceDate(x.d)}: ${x.n}`}</title></rect>;
        })}
      </svg>
      <div className="activity-x"><span>{parseDate(data[0].d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span><span>Today</span></div>
    </button>
  );
}
