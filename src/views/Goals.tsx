import { useMemo, useState } from 'react';
import { useGoals, useProjects } from '../lib/hooks';
import { save, remove, restore } from '../lib/db';
import { saveWithUndo } from '../lib/undo';
import { goalProgress, goalPlan, planFromAI, weeksCarried, goalWeeks, goalCoversWeek, earliestDueWeek, movedGoal, mtoLevel, weekEnd, stepCounts } from '../lib/models';
import { planGoal } from '../lib/ai';
import { aiReady } from '../lib/aiProvider';
import { useSettings } from '../lib/settings';
import { today, addDays, mondayOf, parseDate, daysBetween, toISODate } from '../lib/dates';
import { PlanEditor } from '../components/Plan';
import { GoalWizard, weekName } from '../components/GoalWizard';
import { Check, Progress, ViewHead, errMsg, toast } from '../components/ui';
import { Icon } from '../components/icons';
import type { Goal, Project } from '../lib/types';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortWeek = (monday: string) => { const d = parseDate(monday); return `${d.getDate()} ${MON[d.getMonth()]}`; };

export function Goals() {
  const goals = useGoals();
  const projects = useProjects();
  const pmap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const thisWeek = mondayOf(today());
  const [week, setWeek] = useState(thisWeek);
  const [wizard, setWizard] = useState<{ goal?: Goal } | null>(null);
  const [showTips, setShowTips] = useState(false);
  const isCurrent = week === thisWeek;

  const live = goals.filter((g) => g.status !== 'dropped');
  const rank = (g: Goal) => (g.status === 'done' ? 2 : g.priority === 'high' ? 0 : 1);
  // Open goals show in every week their span covers; achieved goals show in
  // the weeks up to the one they were achieved in.
  const doneWeek = (g: Goal) => (g.doneAt ? mondayOf(toISODate(new Date(g.doneAt))) : '');
  const inWeek = live.filter((g) => g.status === 'active'
    ? goalCoversWeek(g, week)
    : (goalCoversWeek(g, week) && week <= doneWeek(g)) || doneWeek(g) === week)
    .sort((a, b) => rank(a) - rank(b) || a.createdAt - b.createdAt);
  const overdue = isCurrent ? live.filter((g) => g.status === 'active' && g.weekStart < thisWeek) : [];
  const upcoming = isCurrent ? live.filter((g) => g.status === 'active' && g.firstWeek > thisWeek).sort((a, b) => a.firstWeek.localeCompare(b.firstWeek)).slice(0, 6) : [];
  const recent = isCurrent ? live.filter((g) => g.status === 'done' && g.doneAt && Date.now() - g.doneAt < 28 * 86400_000).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)).slice(0, 6) : [];
  const recentShown = recent.filter((g) => !inWeek.includes(g)); // don't list a goal twice
  const achieved = inWeek.filter((g) => g.status === 'done').length;
  const avg = inWeek.length ? Math.round(inWeek.reduce((a, g) => a + goalProgress(g, pmap), 0) / inWeek.length) : 0;
  const history = Array.from({ length: 8 }, (_, i) => addDays(thisWeek, (i - 7) * 7)).map((w) => {
    const gs = live.filter((g) => goalCoversWeek(g, w));
    return { w, total: gs.length, done: gs.filter((g) => g.status === 'done').length };
  });
  const daysLeft = isCurrent ? 7 - daysBetween(thisWeek, today()) : null;

  return (
    <div className="view" style={{ maxWidth: 900 }}>
      <ViewHead title="Weekly goals" sub={`${weekName(week)}${isCurrent ? ` · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : ''}`}>
        <div className="seg">
          <button onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week">‹</button>
          <button className={isCurrent ? 'on' : ''} onClick={() => setWeek(thisWeek)}>This week</button>
          <button onClick={() => setWeek(addDays(week, 7))} aria-label="Next week">›</button>
        </div>
        <button className="btn primary" onClick={() => setWizard({})}><Icon name="plus" size={16} /> New goal</button>
      </ViewHead>

      <div className="goal-summary card">
        <div><div className="n">{achieved}/{inWeek.length}</div><div className="l">Achieved</div></div>
        <div style={{ flex: 1, minWidth: 160 }}><div className="l" style={{ marginBottom: 6 }}>Average progress · {avg}%</div><Progress value={avg} /></div>
        <div className="hist" aria-label="Last 8 weeks">
          {history.map((h) => (
            <button key={h.w} className={'hist-bar' + (h.w === week ? ' on' : '')} title={`${weekName(h.w)}: ${h.done}/${h.total}`} onClick={() => setWeek(h.w)}>
              <i style={{ height: `${h.total ? Math.max(8, (h.done / h.total) * 100) : 4}%`, opacity: h.total ? 1 : 0.3 }} />
            </button>
          ))}
        </div>
      </div>

      {(showTips || !live.length) ? (
        <div className="card tips">
          <b>How to set goals that work</b>
          <ul>
            <li><b>Break it down.</b> Split a big goal into small daily actions so the week stays realistic.</li>
            <li><b>Prioritise.</b> Star the 1–2 goals with the most impact and put your energy there first.</li>
            <li><b>Use a framework.</b> <i>SMART</i> makes a result clear (specific, measurable, achievable, relevant, time-bound). <i>MTO</i> gives a habit three levels (Minimum, Target, Outrageous) so a hard week still counts.</li>
          </ul>
          <span className="small muted">Tap <b>New goal</b> and Orbit walks you through it.</span>
        </div>
      ) : <button className="linkish small" style={{ margin: '0 0 12px' }} onClick={() => setShowTips(true)}>How to set goals that work</button>}

      {overdue.length > 0 && (
        <div className="card attention">
          <div className="card-h">Needs a new week · {overdue.length}</div>
          <div className="card-b">
            {overdue.map((g) => (
              <div key={g.id} className="trow" style={{ alignItems: 'center', cursor: 'default' }}>
                <div className="t-main">
                  <div className="t-title">{g.title}</div>
                  <div className="small muted">Was due {weekName(g.weekStart).toLowerCase()} · {goalProgress(g, pmap)}% done</div>
                </div>
                <button className="btn sm primary" onClick={() => saveWithUndo('goals', g, movedGoal(g, thisWeek), `Continuing this week: ${g.title}`)}>This week</button>
                <button className="btn sm" onClick={() => saveWithUndo('goals', g, movedGoal(g, addDays(thisWeek, 7)), `Moved to next week: ${g.title}`)}>Next week</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="stack">
        {inWeek.map((g) => <GoalCard key={g.id} g={g} project={g.projectId ? pmap.get(g.projectId) : undefined} progress={goalProgress(g, pmap)} onEdit={() => setWizard({ goal: g })} />)}
        {!inWeek.length && (
          <div className="card"><div className="empty" style={{ padding: 24 }}>
            {isCurrent ? 'No goals this week yet. Tap New goal: 1–3 goals is a good amount.' : week > thisWeek ? 'Nothing planned for this week yet.' : 'No goals were open this week.'}
            {week >= thisWeek && <div style={{ marginTop: 10 }}><button className="btn sm primary" onClick={() => setWizard({})}><Icon name="plus" size={14} /> New goal{isCurrent ? '' : ' for this week'}</button></div>}
          </div></div>
        )}
      </div>

      {upcoming.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-h">Coming up</div>
          <div className="card-b">
            {upcoming.map((g) => (
              <div key={g.id} className="trow" onClick={() => setWeek(g.firstWeek)} style={{ alignItems: 'center' }}>
                <span className="done-ico" style={{ background: 'var(--panel-2)', color: 'var(--ink-2)' }}>{g.priority === 'high' ? '⭐' : '○'}</span>
                <div className="t-main"><div className="t-title">{g.title}</div><div className="small muted">Starts {weekName(g.firstWeek).toLowerCase()}</div></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {recentShown.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-h">Recently achieved</div>
          <div className="card-b">
            {recentShown.map((g) => (
              <div key={g.id} className="trow done-row" style={{ alignItems: 'center', cursor: 'default' }}>
                <span className="done-ico k-goal">🎯</span>
                <div className="t-main"><div className="t-title">{g.title}</div><div className="small muted">Achieved {new Date(g.doneAt!).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}{goalWeeks(g) > 1 ? ` · took ${goalWeeks(g)} weeks` : ''}</div></div>
                <button className="btn sm" onClick={() => saveWithUndo('goals', g, { ...g, status: 'active', doneAt: null }, `Goal reopened: ${g.title}`)}>Reopen</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {wizard && <GoalWizard initial={wizard.goal} startWeek={week} onClose={() => setWizard(null)} />}
      <button className="fab" aria-label="New goal" onClick={() => setWizard({})}>+</button>
    </div>
  );
}

function GoalCard({ g, project, progress, onEdit }: { g: Goal; project?: Project; progress: number; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [busy, setBusy] = useState(false);
  useSettings(); // re-render when AI settings change
  const done = g.status === 'done';
  const steps = project ? stepCounts(project) : null;
  const thisWeek = mondayOf(today());
  const late = !done && g.weekStart < thisWeek;
  const canEarlier = !done && g.weekStart > earliestDueWeek(); // never before this week
  const fw = g.framework === 'both' ? 'SMART + MTO' : g.framework === 'smart' ? 'SMART' : g.framework === 'mto' ? 'MTO' : '';
  const level = g.mto ? mtoLevel(g.mto) : 'none';

  const move = (dir: 1 | -1) => {
    const next = movedGoal(g, addDays(g.weekStart, dir * 7));
    if (next.weekStart === g.weekStart && next.firstWeek === g.firstWeek) return;
    saveWithUndo('goals', g, next, `${g.title}: now due ${weekName(next.weekStart).toLowerCase()}`);
  };
  const toggleDone = () => saveWithUndo('goals', g, { ...g, status: done ? 'active' : 'done', doneAt: done ? null : Date.now() }, done ? `Goal reopened: ${g.title}` : `Goal achieved: ${g.title} 🎉`);
  const setCurrent = (v: number) => g.mto && save('goals', { ...g, mto: { ...g.mto, current: Math.max(0, v) } });

  const makePlan = async (withAI: boolean) => {
    setBusy(true);
    try {
      const start = g.firstWeek < today() ? today() : g.firstWeek;
      const finish = weekEnd(g.weekStart);
      const plan = withAI ? planFromAI(await planGoal(g.title, g.details, start, finish), start, finish) : [];
      const p = goalPlan(g, plan);
      await save('projects', p);
      await save('goals', { ...g, projectId: p.id });
      setPlanning(false); setOpen(true);
    } catch (e) { toast(errMsg(e), true); }
    finally { setBusy(false); }
  };
  const del = async () => {
    if (!confirm(`Delete goal "${g.title}"?`)) return;
    const withPlan = project && project.kind === 'goal';
    if (withPlan) await remove('projects', project.id);
    await remove('goals', g.id);
    toast(`Deleted goal: ${g.title}`, false, { label: 'Undo', run: async () => { await restore('goals', g.id); if (withPlan) await restore('projects', project.id); } });
  };

  return (
    <div className={'card goal' + (done ? ' done' : '') + (g.priority === 'high' ? ' high' : '')}>
      <div className="goal-top">
        <Check on={done} onClick={toggleDone} round label="Mark achieved" />
        <div className="t-main" onClick={() => setOpen(!open)} style={{ cursor: 'pointer' }}>
          <div className="goal-title">{g.title}</div>
          <div className="t-meta">
            {g.priority === 'high' && <span className="chip soon">⭐ Top priority</span>}
            {fw && <span className="chip">{fw}</span>}
            {goalWeeks(g) > 1 && <span className="chip">{shortWeek(g.firstWeek)} → {shortWeek(g.weekStart)} · {goalWeeks(g)} wks</span>}
            {weeksCarried(g) > 0 && !done && <span className="chip">pushed {weeksCarried(g)}×</span>}
            {late && <span className="chip over">Past due</span>}
            {steps && steps.total > 0 && <span className="chip">{steps.done}/{steps.total} steps</span>}
            {done && <span className="chip ok">Achieved</span>}
          </div>
        </div>
        <b className="goal-pct">{progress}%</b>
      </div>
      <div style={{ padding: '0 16px' }}><Progress value={progress} /></div>

      {g.mto && (g.framework === 'mto' || g.framework === 'both') && (
        <div className="mto-track">
          <div className="row" style={{ gap: 8 }}>
            <span className="small" style={{ fontWeight: 600 }}>{g.mto.measure || 'Progress'}</span>
            <span style={{ flex: 1 }} />
            <button className="btn sm" onClick={() => setCurrent(g.mto!.current - 1)} aria-label="Less">−</button>
            <input className="input mto-in" type="number" inputMode="decimal" value={g.mto.current} onChange={(e) => setCurrent(Number(e.target.value) || 0)} aria-label="Current amount" />
            <button className="btn sm" onClick={() => setCurrent(g.mto!.current + 1)} aria-label="More">+</button>
          </div>
          <div className="mto-levels">
            <span className={level !== 'none' ? 'hit' : ''}>Min {g.mto.min ?? '–'}</span>
            <span className={level === 'target' || level === 'outrageous' ? 'hit' : ''}>Target {g.mto.target ?? '–'}</span>
            <span className={level === 'outrageous' ? 'hit' : ''}>Outrageous {g.mto.outrageous ?? '–'}</span>
          </div>
        </div>
      )}

      {!project && !done && !(g.mto && g.mto.target && (g.framework === 'mto' || g.framework === 'both')) && (
        <div className="row small" style={{ padding: '10px 16px 0' }}>
          <span className="muted">Progress</span>
          <input type="range" min={0} max={100} step={5} value={g.progress} style={{ flex: 1, accentColor: 'var(--accent)' }}
            onChange={(e) => save('goals', { ...g, progress: +e.target.value })} />
        </div>
      )}

      {!done && (
        <div className="week-mover" aria-label="Due week">
          <span className="small muted">Due</span>
          <button className="btn sm" onClick={() => move(-1)} disabled={!canEarlier} aria-label="One week earlier">‹</button>
          <b>{weekName(g.weekStart)}</b>
          <button className="btn sm" onClick={() => move(1)} aria-label="One week later">›</button>
        </div>
      )}

      <div className="goal-actions">
        <button className="btn sm" onClick={() => setOpen(!open)}>{open ? 'Hide details' : project ? 'Steps & details' : 'Details'}</button>
        <span style={{ flex: 1 }} />
        <button className="btn sm ghost" onClick={() => saveWithUndo('goals', g, { ...g, priority: g.priority === 'high' ? 'normal' : 'high' }, g.priority === 'high' ? 'Priority: normal' : 'Marked top priority')} aria-label="Toggle top priority" title="Top priority">{g.priority === 'high' ? '★' : '☆'}</button>
        <button className="btn sm ghost" onClick={onEdit}>Edit</button>
        <button className="btn sm ghost danger" onClick={del} aria-label="Delete goal"><Icon name="trash" size={14} /></button>
      </div>

      {open && (
        <div className="goal-body">
          {g.details && <p className="small" style={{ margin: 0 }}><b>Why:</b> {g.details}</p>}
          {g.smart && (g.framework === 'smart' || g.framework === 'both') && (
            <div className="smart-box">
              {([['S', 'Specific', g.smart.specific], ['M', 'Measurable', g.smart.measurable], ['A', 'Achievable', g.smart.achievable], ['R', 'Relevant', g.smart.relevant], ['T', 'Time-bound', `Due ${weekName(g.weekStart).toLowerCase()}`]] as const)
                .filter(([, , v]) => v).map(([k, l, v]) => <div key={k}><span className="smart-k">{k}</span><span><b>{l}:</b> {v}</span></div>)}
            </div>
          )}
          {project ? <PlanEditor project={project} onChange={(next) => save('projects', next)} compact /> : !done && (
            planning ? (
              <div className="goal-plan">
                <div className="row wrap">
                  <button className="btn" disabled={busy} onClick={() => makePlan(false)}>Add steps myself</button>
                  {aiReady() && <button className="btn primary" disabled={busy} onClick={() => makePlan(true)}><Icon name="capture" size={15} /> {busy ? 'Planning…' : 'Suggest steps (AI)'}</button>}
                </div>
              </div>
            ) : <button className="btn sm" onClick={() => setPlanning(true)}><Icon name="tasks" size={14} /> Break into steps</button>
          )}
        </div>
      )}
    </div>
  );
}
