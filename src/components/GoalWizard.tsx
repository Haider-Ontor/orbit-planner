import { useState } from 'react';
import type { Goal, SmartCriteria, MtoLevels, PlanTask } from '../lib/types';
import { save, db } from '../lib/db';
import { newGoal, goalPlan, newPlanTask, newPlanSub } from '../lib/models';
import { today, addDays, mondayOf, parseDate } from '../lib/dates';
import { Modal, toast } from './ui';

/* Step-by-step goal setup for people who have never used a goal "framework":
 * 1 what · 2 what kind (picks SMART and/or MTO for them) · 3 the criteria ·
 * 4 when + how important · 5 small daily actions. */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export function weekName(monday: string) {
  const thisWeek = mondayOf(today());
  const a = parseDate(monday), b = parseDate(addDays(monday, 6));
  const range = `${a.getDate()}${a.getMonth() === b.getMonth() ? '' : ' ' + MON[a.getMonth()]} – ${b.getDate()} ${MON[b.getMonth()]}`;
  if (monday === thisWeek) return `This week (${range})`;
  if (monday === addDays(thisWeek, 7)) return `Next week (${range})`;
  return `Week of ${a.getDate()} ${MON[a.getMonth()]}`;
}
const weekOptions = (from: string, n = 16) => Array.from({ length: n }, (_, i) => addDays(from, i * 7));

type Kind = 'smart' | 'mto' | 'both' | 'none';
interface Action { text: string; days: number[] }

export function GoalWizard({ initial, startWeek, onClose }: { initial?: Goal; startWeek?: string; onClose: () => void }) {
  const thisWeek = mondayOf(today());
  const [step, setStep] = useState(initial ? 2 : 1);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [why, setWhy] = useState(initial?.details ?? '');
  const [kind, setKind] = useState<Kind>(initial?.framework ?? 'smart');
  const [smart, setSmart] = useState<SmartCriteria>(initial?.smart ?? { specific: '', measurable: '', achievable: '', relevant: '' });
  const [mto, setMto] = useState<MtoLevels>(initial?.mto ?? { measure: '', min: null, target: null, outrageous: null, current: 0 });
  const [first, setFirst] = useState(initial?.firstWeek ?? (startWeek && startWeek >= thisWeek ? startWeek : thisWeek));
  const [due, setDue] = useState(initial?.weekStart ?? (startWeek && startWeek >= thisWeek ? startWeek : thisWeek));
  const [priority, setPriority] = useState<'high' | 'normal'>(initial?.priority ?? 'normal');
  const [actions, setActions] = useState<Action[]>([{ text: '', days: [] }]);
  const [busy, setBusy] = useState(false);

  const usesSmart = kind === 'smart' || kind === 'both';
  const usesMto = kind === 'mto' || kind === 'both';
  const steps = [1, 2, 3, 4, 5].filter((s) => !(s === 3 && kind === 'none'));
  const idx = steps.indexOf(step);
  const next = () => setStep(steps[Math.min(steps.length - 1, idx + 1)]);
  const back = () => setStep(steps[Math.max(0, idx - 1)]);
  const canNext = step !== 1 || title.trim().length > 0;

  const finish = async () => {
    if (!title.trim()) { setStep(1); return; }
    setBusy(true);
    try {
      const base = initial ?? newGoal({});
      const g: Goal = {
        ...base, title: title.trim(), details: why.trim(), framework: kind, priority,
        firstWeek: first, weekStart: due < first ? first : due,
        smart: usesSmart ? smart : base.smart, mto: usesMto ? mto : base.mto,
      };
      // daily actions → the goal's step list (one task per action, one sub-task per chosen day)
      const real = actions.filter((a) => a.text.trim());
      if (real.length) {
        const tasks: PlanTask[] = real.map((a) => {
          const days = a.days.length ? [...a.days].sort() : [];
          return newPlanTask({
            name: a.text.trim(),
            start: days.length ? addDays(first, days[0]) : null,
            due: days.length ? addDays(first, days[days.length - 1]) : null,
            subs: days.map((d) => { const date = addDays(first, d); const dt = parseDate(date); return newPlanSub({ name: `${DAYS[d]} ${dt.getDate()} ${MON[dt.getMonth()]}`, due: date }); }),
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
        : <button className="btn primary" disabled={busy || !title.trim()} onClick={finish}>{initial ? 'Save' : 'Add goal'}</button>}
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
          <KindCard on={kind === 'smart'} onClick={() => setKind('smart')} icon="🎯" title="Finish something"
            text="A result with an end: submit a report, build a prototype, pass an exam. Uses SMART so it is clear when it is done." />
          <KindCard on={kind === 'mto'} onClick={() => setKind('mto')} icon="📈" title="Build a habit or reach a number"
            text="Something you repeat or count: study hours, workouts, savings. Uses Minimum / Target / Outrageous, so a small win still counts." />
          <KindCard on={kind === 'both'} onClick={() => setKind('both')} icon="⚡" title="Both"
            text="A clear SMART goal with three levels for its number. Good for most bigger goals." />
          <KindCard on={kind === 'none'} onClick={() => setKind('none')} icon="✏️" title="Keep it simple"
            text="Just the goal and its steps, no extra questions." />
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
          <p className="small muted">Time-bound: you set the finish week in the next step.</p>
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
        <div className="grid2">
          <label className="field">Start
            <select className="select" value={first} onChange={(e) => { setFirst(e.target.value); if (due < e.target.value) setDue(e.target.value); }}>
              {weekOptions(initial && initial.firstWeek < thisWeek ? initial.firstWeek : thisWeek).map((w) => <option key={w} value={w}>{weekName(w)}</option>)}
            </select>
          </label>
          <label className="field">Finish by
            <select className="select" value={due} onChange={(e) => setDue(e.target.value)}>
              {weekOptions(first < thisWeek ? thisWeek : first).map((w) => <option key={w} value={w}>{weekName(w)}</option>)}
            </select>
          </label>
        </div>
        <div className="kind-grid two">
          <KindCard on={priority === 'high'} onClick={() => setPriority('high')} icon="⭐" title="Top priority" text="Most important or most impact. Shown first; put your energy here." />
          <KindCard on={priority === 'normal'} onClick={() => setPriority('normal')} icon="○" title="Normal" text="Worth doing, but it can wait behind your top goals." />
        </div>
      </>)}

      {step === 5 && (<>
        <h3 className="wiz-q">Break it into small daily actions</h3>
        <p className="small muted">Small steps keep the week realistic. Pick the days you'll do each one; they become ticks you can check off. You can skip this.</p>
        {actions.map((a, i) => (
          <div key={i} className="action-row">
            <input className="input" placeholder={i === 0 ? 'e.g. Write one section (45 min)' : 'Another action…'} value={a.text}
              onChange={(e) => { const n = [...actions]; n[i] = { ...a, text: e.target.value }; if (i === actions.length - 1 && e.target.value) n.push({ text: '', days: [] }); setActions(n); }} />
            <div className="day-chips">
              {DAYS.map((d, di) => (
                <button key={d} className={'day-chip' + (a.days.includes(di) ? ' on' : '')} aria-pressed={a.days.includes(di)}
                  onClick={() => { const n = [...actions]; n[i] = { ...a, days: a.days.includes(di) ? a.days.filter((x) => x !== di) : [...a.days, di] }; setActions(n); }}>{d[0]}</button>
              ))}
            </div>
          </div>
        ))}
        <p className="small muted">Days are in your start week ({weekName(first)}).</p>
      </>)}
    </Modal>
  );
}

function KindCard({ on, onClick, icon, title, text }: { on: boolean; onClick: () => void; icon: string; title: string; text: string }) {
  return (
    <button className={'kind-card' + (on ? ' on' : '')} onClick={onClick} aria-pressed={on}>
      <span className="kind-ico">{icon}</span>
      <span><b>{title}</b><span className="small muted" style={{ display: 'block' }}>{text}</span></span>
    </button>
  );
}

function Field({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  return <label className="field">{label}<input className="input" placeholder={hint} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}
