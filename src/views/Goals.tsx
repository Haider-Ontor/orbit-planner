import { useMemo, useState } from 'react';
import { useGoals, useProjects } from '../lib/hooks';
import { save, remove } from '../lib/db';
import { newGoal, goalProgress, goalPlan, planFromAI, weeksCarried, weekEnd, stepCounts } from '../lib/models';
import { planGoal } from '../lib/ai';
import { useSettings } from '../lib/settings';
import { today, addDays, mondayOf, parseDate, daysBetween } from '../lib/dates';
import { PlanEditor } from '../components/Plan';
import { Check, Progress, ViewHead, errMsg, toast } from '../components/ui';
import { Icon } from '../components/icons';
import type { Goal, Project } from '../lib/types';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function weekLabel(monday: string) {
  const a = parseDate(monday), b = parseDate(addDays(monday, 6));
  const left = a.getMonth() === b.getMonth() ? `${a.getDate()}` : `${a.getDate()} ${MON[a.getMonth()]}`;
  return `${left} – ${b.getDate()} ${MON[b.getMonth()]}`;
}

export function Goals() {
  const goals = useGoals();
  const projects = useProjects();
  const pmap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const thisWeek = mondayOf(today());
  const [week, setWeek] = useState(thisWeek);
  const [title, setTitle] = useState('');
  const isCurrent = week === thisWeek;

  const inWeek = goals.filter((g) => g.weekStart === week && g.status !== 'dropped');
  const carried = isCurrent ? goals.filter((g) => g.status === 'active' && g.weekStart < thisWeek) : [];
  const achieved = inWeek.filter((g) => g.status === 'done').length;
  const avg = inWeek.length ? Math.round(inWeek.reduce((a, g) => a + goalProgress(g, pmap), 0) / inWeek.length) : 0;

  const history = Array.from({ length: 8 }, (_, i) => addDays(thisWeek, (i - 7) * 7)).map((w) => {
    const gs = goals.filter((g) => g.weekStart === w && g.status !== 'dropped');
    return { w, total: gs.length, done: gs.filter((g) => g.status === 'done').length };
  });

  const add = async () => {
    if (!title.trim()) return;
    await save('goals', newGoal({ title: title.trim(), weekStart: week, firstWeek: week }));
    setTitle('');
  };

  const daysLeft = isCurrent ? 7 - daysBetween(thisWeek, today()) : null;

  return (
    <div className="view">
      <ViewHead title="Weekly goals" sub={`Week of ${weekLabel(week)}${isCurrent ? ` · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : ''}`}>
        <div className="seg">
          <button onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week">‹</button>
          <button className={isCurrent ? 'on' : ''} onClick={() => setWeek(thisWeek)}>This week</button>
          <button onClick={() => setWeek(addDays(week, 7))} aria-label="Next week">›</button>
        </div>
      </ViewHead>

      <div className="goal-summary card">
        <div><div className="n">{achieved}/{inWeek.length}</div><div className="l">Goals achieved</div></div>
        <div style={{ flex: 1, minWidth: 160 }}><div className="l" style={{ marginBottom: 6 }}>Average progress · {avg}%</div><Progress value={avg} /></div>
        <div className="hist" aria-label="Last 8 weeks">
          {history.map((h) => (
            <button key={h.w} className={'hist-bar' + (h.w === week ? ' on' : '')} title={`${weekLabel(h.w)}: ${h.done}/${h.total}`} onClick={() => setWeek(h.w)}>
              <i style={{ height: `${h.total ? Math.max(8, (h.done / h.total) * 100) : 4}%`, opacity: h.total ? 1 : 0.3 }} />
            </button>
          ))}
        </div>
      </div>

      <div className="quick">
        <input className="input" placeholder={isCurrent ? 'This week I will…' : `Goal for the week of ${weekLabel(week)}…`} value={title}
          onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="btn primary" onClick={add}><Icon name="plus" size={16} /> Add goal</button>
      </div>

      {carried.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderColor: 'var(--warn)' }}>
          <div className="card-h">Still open from earlier weeks</div>
          <div className="card-b">
            {carried.map((g) => (
              <div key={g.id} className="trow" style={{ alignItems: 'center' }}>
                <div className="t-main">
                  <div className="t-title">{g.title}</div>
                  <div className="t-meta"><span className="chip">Set for week of {weekLabel(g.weekStart)}</span><span className="chip">{goalProgress(g, pmap)}% done</span></div>
                </div>
                <button className="btn sm primary" onClick={() => save('goals', { ...g, weekStart: thisWeek })}>Continue this week</button>
                <button className="btn sm ghost" onClick={() => save('goals', { ...g, status: 'dropped' })}>Drop</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="stack">
        {inWeek.map((g) => <GoalCard key={g.id} g={g} project={g.projectId ? pmap.get(g.projectId) : undefined} progress={goalProgress(g, pmap)} />)}
        {!inWeek.length && (
          <div className="card"><div className="empty" style={{ padding: 24 }}>
            {isCurrent ? 'No goals for this week yet. Write 1–3 outcomes you want by Sunday, then break each one into steps.' : 'No goals were set for this week.'}
          </div></div>
        )}
      </div>
    </div>
  );
}

function GoalCard({ g, project, progress }: { g: Goal; project?: Project; progress: number }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(g.title);
  const [planning, setPlanning] = useState(false);
  const [finishBy, setFinishBy] = useState(weekEnd(g.weekStart));
  const [busy, setBusy] = useState(false);
  const s = useSettings();
  const carried = weeksCarried(g);
  const done = g.status === 'done';
  const steps = project ? stepCounts(project) : null;

  const toggleDone = () => save('goals', { ...g, status: done ? 'active' : 'done', doneAt: done ? null : Date.now() });

  const makePlan = async (withAI: boolean) => {
    setBusy(true);
    try {
      const start = g.weekStart < today() ? today() : g.weekStart;
      const plan = withAI ? planFromAI(await planGoal(g.title, g.details, start, finishBy), start, finishBy) : [];
      const p = goalPlan(g, plan);
      await save('projects', p);
      await save('goals', { ...g, projectId: p.id });
      setPlanning(false); setOpen(true);
      if (withAI) toast('Steps planned. Tick them off as you go.');
    } catch (e) { toast(errMsg(e), true); }
    finally { setBusy(false); }
  };

  const del = async () => {
    if (!confirm(`Delete goal "${g.title}"${project ? ' and its steps' : ''}?`)) return;
    if (project && project.kind === 'goal') await remove('projects', project.id);
    await remove('goals', g.id);
  };

  return (
    <div className={'card goal' + (done ? ' done' : '')}>
      <div className="goal-top">
        <Check on={done} onClick={toggleDone} round label="Mark achieved" />
        <div className="t-main">
          {editing ? (
            <input className="input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
              onBlur={() => { setEditing(false); if (title.trim() && title !== g.title) save('goals', { ...g, title: title.trim() }); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setTitle(g.title); setEditing(false); } }} />
          ) : (
            <div className="goal-title" onClick={() => setEditing(true)} title="Tap to rename">{g.title}</div>
          )}
          <div className="t-meta">
            {carried > 0 && <span className="chip soon">Carried over · {carried} wk</span>}
            {steps && steps.total > 0 && <span className="chip">{steps.done}/{steps.total} steps</span>}
            {done && <span className="chip ok">Achieved</span>}
          </div>
        </div>
        <b className="goal-pct">{progress}%</b>
      </div>
      <div style={{ padding: '0 16px' }}><Progress value={progress} /></div>

      {!project && !done && (
        <div className="row small" style={{ padding: '10px 16px 0' }}>
          <span className="muted">Progress</span>
          <input type="range" min={0} max={100} step={5} value={g.progress} style={{ flex: 1, accentColor: 'var(--accent)' }}
            onChange={(e) => save('goals', { ...g, progress: +e.target.value })} />
        </div>
      )}

      <div className="goal-actions">
        {project
          ? <button className="btn sm" onClick={() => setOpen(!open)}><Icon name="tasks" size={14} /> {open ? 'Hide steps' : 'Show steps'}</button>
          : <button className="btn sm" onClick={() => setPlanning(!planning)}><Icon name="tasks" size={14} /> Break into steps</button>}
        <button className="btn sm ghost" onClick={() => setOpen(!open)}>{open ? 'Less' : 'Notes'}</button>
        <span style={{ flex: 1 }} />
        {!done && <button className="btn sm ghost" onClick={() => save('goals', { ...g, weekStart: addDays(g.weekStart, 7) })} title="Move to next week">Next week →</button>}
        <button className="btn sm ghost danger" onClick={del} aria-label="Delete goal"><Icon name="trash" size={14} /></button>
      </div>

      {planning && !project && (
        <div className="goal-plan">
          <label className="row small" style={{ gap: 8 }}>
            <b>Finish by</b>
            <input className="input" type="date" value={finishBy} min={today()} style={{ width: 'auto' }} onChange={(e) => setFinishBy(e.target.value || weekEnd(g.weekStart))} />
          </label>
          <div className="row wrap">
            <button className="btn" disabled={busy} onClick={() => makePlan(false)}>Add steps myself</button>
            <button className="btn primary" disabled={busy || !s.anthropicKey} onClick={() => makePlan(true)} title={s.anthropicKey ? '' : 'Add a Claude API key in Settings'}>
              <Icon name="capture" size={15} /> {busy ? 'Planning…' : 'Plan steps with AI'}
            </button>
          </div>
          {!s.anthropicKey && <div className="small muted">AI planning needs a Claude API key (Settings → AI).</div>}
        </div>
      )}

      {open && (
        <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <textarea className="textarea" style={{ minHeight: 60 }} placeholder="Why this matters, what done looks like…" defaultValue={g.details}
            onBlur={(e) => { if (e.target.value !== g.details) save('goals', { ...g, details: e.target.value }); }} />
          {project && <PlanEditor project={project} onChange={(next) => save('projects', next)} compact />}
          {project && <div className="small muted">The goal's progress follows its steps. It stays open across weeks until you tick it achieved.</div>}
        </div>
      )}
    </div>
  );
}
