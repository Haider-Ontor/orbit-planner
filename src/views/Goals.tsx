import { useMemo, useState } from 'react';
import { useGoals, useProjects } from '../lib/hooks';
import { save, remove, restore } from '../lib/db';
import { saveWithUndo } from '../lib/undo';
import { goalProgress, goalPlan, planFromAI, weeksCarried, goalWeeks, goalCoversWeek, movedGoal, mtoLevel, weekEnd, stepCounts, deadlinesOf, withDeadline, goalLate, goalCanMoveEarlier, goalDueMode, goalDueText, goalStartText, goalInMonth } from '../lib/models';
import { deadlineMs, deadlineText, countdown } from '../lib/deadline';
import { DeadlineChip } from '../components/DeadlinePicker';
import { planGoal } from '../lib/ai';
import { aiReady } from '../lib/aiProvider';
import { useSettings } from '../lib/settings';
import { today, addDays, mondayOf, parseDate, daysBetween, toISODate, monthOf, addMonths, monthName } from '../lib/dates';
import { PlanEditor } from '../components/Plan';
import { GoalWizard, weekName } from '../components/GoalWizard';
import { Check, Progress, ViewHead, errMsg, toast, Info } from '../components/ui';
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
    .sort((a, b) => rank(a) - rank(b) || (deadlineMs(a.deadline, a.deadlineTime) ?? Infinity) - (deadlineMs(b.deadline, b.deadlineTime) ?? Infinity) || a.createdAt - b.createdAt);
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
      <ViewHead title="Goals" sub={`${weekName(week)}${isCurrent ? ` · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : ''}`}>
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
          <div className="card-h">Past due · pick a new time · {overdue.length} <Info tip="These goals were not finished in time. Keep going with them this week (or month), or move them on. Nothing is lost: steps and progress stay." /></div>
          <div className="card-b">
            {overdue.map((g) => (
              <div key={g.id} className="trow" style={{ alignItems: 'center', cursor: 'default' }}>
                <div className="t-main">
                  <div className="t-title">{g.title}</div>
                  <div className="small muted">Was due {goalDueText(g)} · {goalProgress(g, pmap)}% done</div>
                </div>
                {goalDueMode(g) === 'month' ? (<>
                  <button className="btn sm primary" data-tip="Due by the end of this month instead." onClick={() => saveWithUndo('goals', g, goalInMonth(g, monthOf(today())), `Continuing this month: ${g.title}`)}>This month</button>
                  <button className="btn sm" data-tip="Due by the end of next month." onClick={() => saveWithUndo('goals', g, goalInMonth(g, addMonths(monthOf(today()), 1)), `Moved to next month: ${g.title}`)}>Next month</button>
                </>) : (<>
                  <button className="btn sm primary" data-tip="Keep working on it this week. It stays open from its first week until now." onClick={() => saveWithUndo('goals', g, movedGoal(g, thisWeek), `Continuing this week: ${g.title}`)}>This week</button>
                  <button className="btn sm" data-tip="Move it to next week. You can move it again later." onClick={() => saveWithUndo('goals', g, movedGoal(g, addDays(thisWeek, 7)), `Moved to next week: ${g.title}`)}>Next week</button>
                </>)}
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
                <span className="done-ico" style={{ background: 'var(--panel-2)', color: 'var(--ink-2)' }}>{g.priority === 'high' ? '★' : '○'}</span>
                <div className="t-main"><div className="t-title">{g.title}</div><div className="small muted">Starts {goalStartText(g)} · due {goalDueText(g)}</div></div>
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
                <span className="done-ico k-goal">★</span>
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
  const nextStep = project ? deadlinesOf([project])[0] : undefined;
  const goalCd = g.deadline && goalDueMode(g) === 'date' ? countdown(g.deadline, g.deadlineTime) : { text: '', tone: '' as const };
  const nextCd = nextStep ? countdown(nextStep.due, nextStep.dueTime) : { text: '', tone: '' as const };
  const thisWeek = mondayOf(today());
  const late = goalLate(g);
  const canEarlier = goalCanMoveEarlier(g); // never into the past
  const fw = g.framework === 'both' ? 'SMART + MTO' : g.framework === 'smart' ? 'SMART' : g.framework === 'mto' ? 'MTO' : '';
  const level = g.mto ? mtoLevel(g.mto) : 'none';

  const mode = goalDueMode(g);
  const move = (dir: 1 | -1) => {
    const next = mode === 'month' ? goalInMonth(g, addMonths(monthOf(g.deadline!), dir)) : movedGoal(g, addDays(g.weekStart, dir * 7));
    if (next.weekStart === g.weekStart && next.firstWeek === g.firstWeek && next.deadline === g.deadline) return;
    saveWithUndo('goals', g, next, `${g.title}: now due ${goalDueText(next)}`);
  };
  const setDeadline = (d: string | null, t: string | null) => {
    const next = withDeadline(g, d, t);
    saveWithUndo('goals', g, next, d ? `${g.title}: due ${goalDueText(next)}` : `${g.title}: due ${goalDueText(next)}`);
  };
  const step = mode === 'month' ? 'month' : 'week';
  const toggleDone = () => saveWithUndo('goals', g, { ...g, status: done ? 'active' : 'done', doneAt: done ? null : Date.now() }, done ? `Goal reopened: ${g.title}` : `Goal achieved: ${g.title} 🎉`);
  const setCurrent = (v: number) => g.mto && save('goals', { ...g, mto: { ...g.mto, current: Math.max(0, v) } });

  const makePlan = async (withAI: boolean) => {
    setBusy(true);
    try {
      const start = g.firstWeek < today() ? today() : g.firstWeek;
      const finish = g.deadline ?? weekEnd(g.weekStart);
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
            {g.priority === 'high' && <span className="chip soon" data-tip="You starred this goal. Top-priority goals are listed first.">Top priority</span>}
            {fw && <span className="chip" data-tip={fw === 'SMART' ? 'SMART: Specific, Measurable, Achievable, Relevant, Time-bound. Open the details to see your answers.' : fw === 'MTO' ? 'MTO: Minimum, Target, Outrageous. Count up below; each level you reach is highlighted.' : 'Uses both SMART answers and MTO levels.'}>{fw}</span>}
            {goalWeeks(g) > 1 && <span className="chip" data-tip={`This goal is open in every week from ${shortWeek(g.firstWeek)} to the week of ${shortWeek(g.weekStart)}.`}>{shortWeek(g.firstWeek)} → {mode === 'month' ? monthName(monthOf(g.deadline!)) : shortWeek(g.weekStart)} · {goalWeeks(g)} wks</span>}
            {weeksCarried(g) > 0 && !done && <span className="chip" data-tip={`Moved later ${weeksCarried(g)} ${step}${weeksCarried(g) === 1 ? '' : 's'} beyond the original plan.`}>pushed {weeksCarried(g)}×</span>}
            {!done && !late && goalCd.text && <span className={'chip ' + (goalCd.tone === 'over' ? 'over' : goalCd.tone === 'soon' ? 'soon' : '')} data-tip={`Time left until this goal is due (${goalDueText(g)}).`}>{goalCd.text}</span>}
            {late && <span className="chip over" data-tip="The finish time has passed. Move it on with the arrows below, or tick it if it's done.">Past due</span>}
            {steps && steps.total > 0 && <span className="chip" data-tip="Steps ticked off out of all steps. Open the goal to see and tick them.">{steps.done}/{steps.total} steps</span>}
            {done && <span className="chip ok">Achieved</span>}
          </div>
        </div>
        <b className="goal-pct">{progress}%</b>
      </div>
      <div style={{ padding: '0 16px' }}><Progress value={progress} /></div>
      {!done && nextStep && (
        <div className={'goal-next small' + (nextCd.tone ? ' ' + nextCd.tone : '')} data-tip="The goal's step with the nearest deadline. Open Steps & details to tick it off.">
          <Icon name="clock" size={13} /><span>Next: <b>{nextStep.name}</b>{nextStep.parent ? ` (${nextStep.parent})` : ''} · {deadlineText(nextStep.due, nextStep.dueTime)}{nextCd.text && !nextCd.text.startsWith('Due') ? ` · ${nextCd.text}` : ''}</span>
        </div>
      )}

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
        <div className={'week-mover m-' + mode} aria-label="When it is due">
          <button className="btn sm" onClick={() => move(-1)} disabled={!canEarlier} aria-label={`One ${step} earlier`}
            data-tip={canEarlier ? `Due one ${step} earlier.` : `Can't move earlier: that ${step} is already over.`}>‹</button>
          {mode === 'date'
            ? <DeadlineChip date={g.deadline ?? null} time={g.deadlineTime ?? null} week={g.weekStart < thisWeek ? thisWeek : g.weekStart} name={g.title} onChange={setDeadline} prefix="Due " showCountdown={false} />
            : <b>Due {mode === 'month' ? `by end of ${monthName(monthOf(g.deadline!))}` : weekName(g.weekStart).replace(/^This|^Next|^Week/, (x) => x.toLowerCase())}</b>}
          <button className="btn sm" onClick={() => move(1)} aria-label={`One ${step} later`}
            data-tip={`Due one ${step} later${mode === 'date' ? ' (same weekday and time)' : ''}. The goal stays open in between.`}>›</button>
          {mode === 'week' && <DeadlineChip date={null} time={null} week={g.weekStart < thisWeek ? thisWeek : g.weekStart} name={g.title} placeholder="+ Exact day & time" onChange={setDeadline}
            tip="Set an exact day and time inside this week, e.g. Thursday 9 am before an exam. You'll get a countdown and a reminder." />}
        </div>
      )}

      <div className="goal-actions">
        <button className="btn sm" onClick={() => setOpen(!open)}>{open ? 'Hide details' : project ? 'Steps & details' : 'Details'}</button>
        <span style={{ flex: 1 }} />
        <button className="btn sm ghost" onClick={() => saveWithUndo('goals', g, { ...g, priority: g.priority === 'high' ? 'normal' : 'high' }, g.priority === 'high' ? 'Priority: normal' : 'Marked top priority')} aria-label="Toggle top priority"
          data-tip={g.priority === 'high' ? 'Top priority. Tap to make it a normal goal.' : 'Star it as top priority: listed first and highlighted.'}>{g.priority === 'high' ? '★' : '☆'}</button>
        <button className="btn sm ghost" onClick={onEdit} data-tip="Change the name, type, start and finish, or add more steps.">Edit</button>
        <button className="btn sm ghost danger" onClick={del} aria-label="Delete goal" data-tip="Delete this goal and its steps. You can undo, or restore it from Done & history → Recently deleted."><Icon name="trash" size={14} /></button>
      </div>

      {open && (
        <div className="goal-body">
          {g.details && <p className="small" style={{ margin: 0 }}><b>Why:</b> {g.details}</p>}
          {g.smart && (g.framework === 'smart' || g.framework === 'both') && (
            <div className="smart-box">
              {([['S', 'Specific', g.smart.specific], ['M', 'Measurable', g.smart.measurable], ['A', 'Achievable', g.smart.achievable], ['R', 'Relevant', g.smart.relevant], ['T', 'Time-bound', `Due ${goalDueText(g)}`]] as const)
                .filter(([, , v]) => v).map(([k, l, v]) => <div key={k}><span className="smart-k">{k}</span><span><b>{l}:</b> {v}</span></div>)}
            </div>
          )}
          {project ? <PlanEditor project={project} onChange={(next) => save('projects', next)} compact week={g.firstWeek > thisWeek ? g.firstWeek : thisWeek} /> : !done && (
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
