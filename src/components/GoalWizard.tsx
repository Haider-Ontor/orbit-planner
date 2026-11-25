import { useState } from 'react';
import type { Goal, SmartCriteria, MtoLevels, PlanTask } from '../lib/types';
import { save, db } from '../lib/db';
import { newGoal, goalPlan, newPlanTask, newPlanSub, goalDueMode, goalDueText, goalStartText, goalWeeks } from '../lib/models';
import { today, addDays, mondayOf, parseDate, weekName, monthOf, monthStart, monthEnd, monthName, addMonths } from '../lib/dates';
import { Modal, toast } from './ui';
import { Icon } from './icons';
import { DeadlineChip } from './DeadlinePicker';
import { DateField, TimeField } from './DateTime';
import { deadlineMs } from '../lib/deadline';

/* Step-by-step goal setup for people who have never used a goal "framework":
 * 1 what · 2 what kind (picks SMART and/or MTO for them) · 3 the criteria ·
 * 4 when + how important · 5 small daily actions. */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export { weekName };
const weekOptions = (from: string, n = 16) => Array.from({ length: n }, (_, i) => addDays(from, i * 7));
const monthOptions = (from: string, n = 12) => Array.from({ length: n }, (_, i) => addMonths(from, i));
const withExtra = (opts: string[], v: string) => (opts.includes(v) ? opts : [v, ...opts]);
type When = 'week' | 'month' | 'date';
const WHEN_TIPS: Record<'start' | 'finish', Record<When, string>> = {
  start: {
    week: 'Start in a calendar week (Monday to Sunday). The goal shows up on the Goals page from that week.',
    month: 'Start at the beginning of a month. Good for longer goals, like a course or a savings target.',
    date: 'Start on an exact day, for example the day after your last exam.',
  },
  finish: {
    week: 'Finish some time in that week. Good for weekly goals.',
    month: 'Finish any time before the month ends, for example “by December”.',
    date: 'Finish by an exact day, with an optional time, for example Thursday at 9 am, before an exam starts.',
  },
};
function WhenSeg({ value, onChange, what }: { value: When; onChange: (v: When) => void; what: 'start' | 'finish' }) {
  return (
    <div className="seg when-seg" role="group" aria-label={what === 'start' ? 'Start by' : 'Finish by'}>
      {(['week', 'month', 'date'] as const).map((m) => (
        <button key={m} className={value === m ? 'on' : ''} aria-pressed={value === m} data-tip={WHEN_TIPS[what][m]} onClick={() => onChange(m)}>
          {m === 'week' ? 'Week' : m === 'month' ? 'Month' : 'Date'}
        </button>
      ))}
    </div>
  );
}

type Kind = 'smart' | 'mto' | 'both' | 'none';
/** A step is done either on chosen days of the start week, or by a deadline. */
interface Action { text: string; mode: 'days' | 'deadline'; days: number[]; due: string | null; dueTime: string | null }
const blankAction = (): Action => ({ text: '', mode: 'days', days: [], due: null, dueTime: null });

export function GoalWizard({ initial, startWeek, onClose }: { initial?: Goal; startWeek?: string; onClose: () => void }) {
  const thisWeek = mondayOf(today());
  const [step, setStep] = useState(initial ? 2 : 1);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [why, setWhy] = useState(initial?.details ?? '');
  const [kind, setKind] = useState<Kind>(initial?.framework ?? 'smart');
  const [smart, setSmart] = useState<SmartCriteria>(initial?.smart ?? { specific: '', measurable: '', achievable: '', relevant: '' });
  const [mto, setMto] = useState<MtoLevels>(initial?.mto ?? { measure: '', min: null, target: null, outrageous: null, current: 0 });
  const initWeek = startWeek && startWeek >= thisWeek ? startWeek : thisWeek;
  const firstDay = initWeek > today() ? initWeek : today();
  const [startMode, setStartMode] = useState<When>(initial?.startDate ? initial.startMode ?? 'week' : 'week');
  const [first, setFirst] = useState(initial?.firstWeek ?? initWeek);
  const [startMonth, setStartMonth] = useState(monthOf(initial?.startDate ?? firstDay));
  const [startDay, setStartDay] = useState(initial?.startDate ?? firstDay);
  const [dueMode, setDueMode] = useState<When>(initial ? goalDueMode(initial) : 'week');
  const [due, setDue] = useState(initial?.weekStart ?? initWeek);
  const [dueMonth, setDueMonth] = useState(monthOf(initial?.deadline ?? addDays(initWeek, 6)));
  const [priority, setPriority] = useState<'high' | 'normal'>(initial?.priority ?? 'normal');
  const [dl, setDl] = useState<{ d: string | null; t: string | null }>(initial && goalDueMode(initial) === 'date' ? { d: initial.deadline ?? null, t: initial.deadlineTime ?? null } : { d: null, t: null });
  const [actions, setActions] = useState<Action[]>([blankAction()]);
  const [busy, setBusy] = useState(false);

  const usesSmart = kind === 'smart' || kind === 'both';
  const usesMto = kind === 'mto' || kind === 'both';
  const steps = [1, 2, 3, 4, 5].filter((s) => !(s === 3 && kind === 'none'));
  const idx = steps.indexOf(step);
  const next = () => setStep(steps[Math.min(steps.length - 1, idx + 1)]);
  const back = () => setStep(steps[Math.max(0, idx - 1)]);
  // ---- when: start + finish, each by week, month or exact date
  // Past weeks, months and dates are allowed: a goal can be added that already started (or is already late).
  const pastWeeks = addDays(thisWeek, -8 * 7);
  const floorWeek = initial && initial.firstWeek < pastWeeks ? initial.firstWeek : pastWeeks;
  const startDate = startMode === 'month' ? monthStart(startMonth) : startMode === 'date' ? startDay : null;
  const firstWeek = startMode === 'week' ? first : mondayOf(startDate!);
  const deadline = dueMode === 'month' ? monthEnd(dueMonth) : dueMode === 'date' ? dl.d : null;
  const deadlineTime = dueMode === 'date' && dl.d ? dl.t : null;
  const dueWeek = deadline ? mondayOf(deadline) : due;
  const whenError = dueMode === 'date' && !dl.d ? 'Pick the date it must be finished by.'
    : (deadline && startDate && deadline < startDate) || dueWeek < firstWeek ? 'The finish is before the start. Pick a later finish, or an earlier start.' : '';
  const preview: Goal = { ...(initial ?? newGoal({})), firstWeek, weekStart: dueWeek, startMode, startDate, dueMode, deadline, deadlineTime };
  const dueWeekFloor = firstWeek;
  const dueMonthFloor = monthOf(startDate ?? addDays(firstWeek, 6));
  const finishPast = !whenError && (deadline ? (deadlineMs(deadline, deadlineTime) ?? 0) < Date.now() : dueWeek < thisWeek);

  const canNext = step === 1 ? title.trim().length > 0 : step === 4 ? !whenError : true;

  const finish = async () => {
    if (!title.trim()) { setStep(1); return; }
    if (whenError) { setStep(4); return; }
    setBusy(true);
    try {
      const base = initial ?? newGoal({});
      const g: Goal = {
        ...base, title: title.trim(), details: why.trim(), framework: kind, priority,
        firstWeek, weekStart: dueWeek, startMode, startDate, dueMode, deadline, deadlineTime,
        smart: usesSmart ? smart : base.smart, mto: usesMto ? mto : base.mto,
      };
      // daily actions → the goal's step list (one task per action, one sub-task per chosen day)
      const real = actions.filter((a) => a.text.trim());
      if (real.length) {
        const tasks: PlanTask[] = real.map((a) => {
          if (a.mode === 'deadline') return newPlanTask({ name: a.text.trim(), due: a.due, dueTime: a.due ? a.dueTime : null });
          const days = a.days.length ? [...a.days].sort() : [];
          return newPlanTask({
            name: a.text.trim(),
            start: days.length ? addDays(firstWeek, days[0]) : null,
            due: days.length ? addDays(firstWeek, days[days.length - 1]) : null,
            subs: days.map((d) => { const date = addDays(firstWeek, d); const dt = parseDate(date); return newPlanSub({ name: `${DAYS[d]} ${dt.getDate()} ${MON[dt.getMonth()]}`, due: date }); }),
          });
        });
        const existing = g.projectId ? await db.projects.get(g.projectId) : undefined;
        if (existing && !existing.deleted) await save('projects', { ...existing, plan: [...(existing.plan ?? []), ...tasks] });
        else { const p = goalPlan(g, tasks); await save('projects', p); g.projectId = p.id; }
      }
      await save('goals', g);
      toast(initial ? 'Goal updated' : 'Goal added');
      onClose();
    } finally { setBusy(false); }
  };

  const num = (v: string) => (v.trim() === '' ? null : Number(v));

  return (
    <Modal title={initial ? 'Edit goal' : 'New goal'} onClose={onClose} footer={<>
      <span className="small muted">Step {idx + 1} of {steps.length}</span>
      <div className="grow" />
      {idx > 0 && <button className="btn" onClick={back}>Back</button>}
      {idx < steps.length - 1
        ? <button className="btn primary" disabled={!canNext} onClick={next}>Next</button>
        : <button className="btn primary" disabled={busy || !title.trim() || !!whenError} onClick={finish}>{initial ? 'Save' : 'Add goal'}</button>}
    </>}>
      <div className="wiz-dots">{steps.map((s, i) => <i key={s} className={i <= idx ? 'on' : ''} />)}</div>

      {step === 1 && (<>
        <h3 className="wiz-q">What do you want to achieve?</h3>
        <input className="input big-in" autoFocus placeholder="e.g. Finish the motor-controller report" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && title.trim()) next(); }} />
        <textarea className="textarea" style={{ minHeight: 64 }} placeholder="Why does it matter to you? (optional)" value={why} onChange={(e) => setWhy(e.target.value)} />
      </>)}

      {step === 2 && (<>
        <h3 className="wiz-q">What kind of goal is it?</h3>
        <div className="kind-grid">
          <KindCard on={kind === 'smart'} onClick={() => setKind('smart')} icon="goals" title="Finish something"
            text="A result with an end: submit a report, build a prototype, pass an exam. Uses SMART so it is clear when it is done."
            tip="SMART = Specific, Measurable, Achievable, Relevant, Time-bound. Next you answer four short questions so the goal has a clear finish line." />
          <KindCard on={kind === 'mto'} onClick={() => setKind('mto')} icon="trend" title="Build a habit or reach a number"
            text="Something you repeat or count: study hours, workouts, savings. Uses Minimum / Target / Outrageous, so a small win still counts."
            tip="MTO = Minimum, Target, Outrageous. You set three numbers, then count up on the goal card; progress fills as you reach each level." />
          <KindCard on={kind === 'both'} onClick={() => setKind('both')} icon="layers" title="Both"
            text="A clear SMART goal with three levels for its number. Good for most bigger goals."
            tip="Asks the SMART questions and the three MTO numbers. Progress comes from the number you count up." />
          <KindCard on={kind === 'none'} onClick={() => setKind('none')} icon="pen" title="Keep it simple"
            text="Just the goal and its steps, no extra questions."
            tip="Skips the framework questions. Progress comes from ticking off its steps, or a slider if it has none." />
        </div>
        <p className="small muted">Not sure? Ask yourself: <b>will I be done once it's finished?</b> Yes → <i>Finish something</i>. If you want to keep doing it or hit a number → <i>Habit or number</i>.</p>
      </>)}

      {step === 3 && (<>
        {usesSmart && (<>
          <h3 className="wiz-q">Make it SMART</h3>
          <Field label="Specific: what exactly will you do?" hint="e.g. Write and submit the 10-page motor-controller report" value={smart.specific} onChange={(v) => setSmart({ ...smart, specific: v })} />
          <Field label="Measurable: how will you know it's done?" hint="e.g. Report uploaded to the portal, all 5 sections complete" value={smart.measurable} onChange={(v) => setSmart({ ...smart, measurable: v })} />
          <Field label="Achievable: what makes it realistic?" hint="e.g. 1 hour each evening; test data already collected" value={smart.achievable} onChange={(v) => setSmart({ ...smart, achievable: v })} />
          <Field label="Relevant: why does it matter now?" hint="e.g. Counts for 30% of the module grade" value={smart.relevant} onChange={(v) => setSmart({ ...smart, relevant: v })} />
          <p className="small muted">Time-bound: you set the finish week (or an exact day and time) in the next step.</p>
        </>)}
        {usesMto && (<>
          <h3 className="wiz-q">Set three levels (MTO)</h3>
          <Field label="What will you count?" hint="e.g. hours studied, pages written, workouts, £ saved" value={mto.measure} onChange={(v) => setMto({ ...mto, measure: v })} />
          <div className="mto-grid">
            <label className="field">Minimum<input className="input" type="number" inputMode="decimal" placeholder="e.g. 3" value={mto.min ?? ''} onChange={(e) => setMto({ ...mto, min: num(e.target.value) })} /><span className="small muted">Still a win on a bad week</span></label>
            <label className="field">Target<input className="input" type="number" inputMode="decimal" placeholder="e.g. 6" value={mto.target ?? ''} onChange={(e) => setMto({ ...mto, target: num(e.target.value) })} /><span className="small muted">What you're aiming for</span></label>
            <label className="field">Outrageous<input className="input" type="number" inputMode="decimal" placeholder="e.g. 10" value={mto.outrageous ?? ''} onChange={(e) => setMto({ ...mto, outrageous: num(e.target.value) })} /><span className="small muted">A great week</span></label>
          </div>
        </>)}
      </>)}

      {step === 4 && (<>
        <h3 className="wiz-q">When, and how important?</h3>
        <div className="when-block">
          <div className="when-h"><b>Start</b><WhenSeg what="start" value={startMode} onChange={setStartMode} /></div>
          {startMode === 'week' && (
            <select className="select" value={first} aria-label="Start week" onChange={(e) => setFirst(e.target.value)}>
              {withExtra(weekOptions(floorWeek, 26), first).map((w) => <option key={w} value={w}>{weekName(w)}</option>)}
            </select>
          )}
          {startMode === 'month' && (
            <select className="select" value={startMonth} aria-label="Start month" onChange={(e) => setStartMonth(e.target.value)}>
              {withExtra(monthOptions(addMonths(monthOf(today()), -6), 19), startMonth).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          )}
          {startMode === 'date' && (
            <DateField value={startDay} onChange={(v) => { if (v) setStartDay(v); }} label="Start date" required />
          )}
        </div>
        <div className="when-block">
          <div className="when-h"><b>Finish by</b><WhenSeg what="finish" value={dueMode} onChange={setDueMode} /></div>
          {dueMode === 'week' && (
            <select className="select" value={due} aria-label="Finish week" onChange={(e) => setDue(e.target.value)}>
              {withExtra(weekOptions(dueWeekFloor, 26), due).map((w) => <option key={w} value={w}>{weekName(w)}</option>)}
            </select>
          )}
          {dueMode === 'month' && (
            <select className="select" value={dueMonth} aria-label="Finish month" onChange={(e) => setDueMonth(e.target.value)}>
              {withExtra(monthOptions(dueMonthFloor, 18), dueMonth).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          )}
          {dueMode === 'date' && (
            <div className="dl-fields">
              <div className="field"><span>Day</span><DateField value={dl.d} onChange={(v) => setDl((x) => ({ ...x, d: v }))} label="Finish day" /></div>
              <div className="field"><span>Time <span className="muted">(optional)</span></span>
                <TimeField value={dl.t} onChange={(v) => setDl((x) => ({ d: x.d ?? (v ? today() : null), t: v }))} label="Finish time" clearable /></div>
            </div>
          )}
        </div>
        {whenError && dueMode === 'date' && !dl.d
          ? <div className="when-sum small"><Icon name="clock" size={14} /> <span>Type or pick the <b>day</b> it must be finished by. Add a time if it matters (e.g. 9 am before an exam).</span></div>
          : whenError
          ? <div className="err-box small" role="alert">{whenError}</div>
          : <div className="when-sum small"><Icon name="calendar" size={14} /> <span>{goalStartText(preview) === goalDueText(preview)
            ? <>Runs <b>{goalDueText(preview)}</b></>
            : <>Runs from <b>{goalStartText(preview)}</b> to <b>{goalDueText(preview)}</b></>} · {goalWeeks(preview)} week{goalWeeks(preview) === 1 ? '' : 's'}
            {finishPast && <> · <b>already past</b>, so it will show as past due</>}</span></div>}
        <div className="kind-grid two">
          <KindCard on={priority === 'high'} onClick={() => setPriority('high')} icon="star" title="Top priority" text="Most important or most impact. Shown first; put your energy here."
            tip="Top-priority goals get a star, are listed first every week and stand out on the Today page." />
          <KindCard on={priority === 'normal'} onClick={() => setPriority('normal')} icon="circle" title="Normal" text="Worth doing, but it can wait behind your top goals."
            tip="Listed after your top-priority goals. You can star it later from the goal card." />
        </div>
      </>)}

      {step === 5 && (<>
        <h3 className="wiz-q">Break it into small steps</h3>
        <p className="small muted">For each step, either pick the <b>days you'll work on it</b>, or give it a <b>deadline</b> it must be done by (for example, each subject before its exam). You can skip this.</p>
        {actions.map((a, i) => {
          const set = (p: Partial<Action>) => { const n = [...actions]; n[i] = { ...a, ...p }; if (i === actions.length - 1 && (p.text ?? a.text)) n.push(blankAction()); setActions(n); };
          return (
            <div key={i} className="action-row">
              <input className="input" placeholder={i === 0 ? 'e.g. Revise Physics, or Write one section' : 'Another step…'} value={a.text}
                onChange={(e) => set({ text: e.target.value })} />
              {a.text.trim() && (
                <div className="seg small-seg" role="group" aria-label="How to schedule this step">
                  <button className={a.mode === 'days' ? 'on' : ''} onClick={() => set({ mode: 'days' })} data-tip="Work on it on the days you pick; each day becomes a tick in the goal's steps.">On certain days</button>
                  <button className={a.mode === 'deadline' ? 'on' : ''} onClick={() => set({ mode: 'deadline' })} data-tip="It must be done by a set day and (optional) time, e.g. each subject before its exam. Shows a countdown and reminds you.">By a deadline</button>
                </div>
              )}
              {a.mode === 'days' ? (
                <div className="day-chips">
                  {DAYS.map((d, di) => (
                    <button key={d} className={'day-chip' + (a.days.includes(di) ? ' on' : '')} aria-pressed={a.days.includes(di)} aria-label={d}
                      onClick={() => set({ days: a.days.includes(di) ? a.days.filter((x) => x !== di) : [...a.days, di] })}>{d[0]}</button>
                  ))}
                </div>
              ) : (
                <DeadlineChip date={a.due} time={a.dueTime} week={firstWeek < thisWeek ? thisWeek : firstWeek} name={a.text.trim()} placeholder="Set deadline"
                  onChange={(d, t) => set({ due: d, dueTime: t })} />
              )}
            </div>
          );
        })}
        {actions.some((a) => a.text.trim() && a.mode === 'days') && <p className="small muted">Days are in your start week ({weekName(firstWeek)}).</p>}
      </>)}
    </Modal>
  );
}

/** "This month (November)", "Next month (December)", "January 2027". */
function monthLabel(ym: string) {
  const rel = monthName(ym, true);
  return rel === 'This month' || rel === 'Next month' ? `${rel} (${monthName(ym)})` : monthName(ym);
}

function KindCard({ on, onClick, icon, title, text, tip }: { on: boolean; onClick: () => void; icon: string; title: string; text: string; tip?: string }) {
  return (
    <button className={'kind-card' + (on ? ' on' : '')} onClick={onClick} aria-pressed={on} data-tip={tip}>
      <span className="kind-ico"><Icon name={icon} size={20} /></span>
      <span><b>{title}</b><span className="small muted" style={{ display: 'block' }}>{text}</span></span>
    </button>
  );
}

function Field({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  return <label className="field">{label}<input className="input" placeholder={hint} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}
