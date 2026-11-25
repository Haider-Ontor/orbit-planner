import { useMemo, useState } from 'react';
import { useTasks, useProjects, useGoals } from '../lib/hooks';
import { QUADRANTS, QUADRANT_ORDER, quadrantOf, quadrantValues, score, type Quadrant, QUADRANT_TIPS } from '../lib/priority';
import { saveWithUndo } from '../lib/undo';
import { prioritizedSteps, setStepPriority, toggleStep, type PrioStep } from '../lib/models';
import { deadlineMs, deadlineText, countdown } from '../lib/deadline';
import { ViewHead } from '../components/ui';
import { Icon } from '../components/icons';
import { openQuickAdd } from '../components/QuickAdd';
import { toggleDone } from '../components/TaskRow';
import { Check } from '../components/ui';
import type { Task, Project } from '../lib/types';

/* Priorities, stacked strictly from most to least urgent, soonest deadline
 * first inside each one. Lists your to-dos and every goal, project and group
 * step you gave a priority. One way to move anything: the "Move" menu (works
 * everywhere). On a computer the ⋮⋮ handle can also be dragged. */

type Item =
  | { type: 'task'; key: string; t: Task; at: number | null }
  | { type: 'step'; key: string; s: PrioStep; at: number | null };
type Show = 'all' | 'todos' | 'steps';

const taskAt = (t: Task) => (t.due ? deadlineMs(t.due, t.dueTime) : t.start ? new Date(t.start).getTime() : null);
const KIND: Record<Project['kind'], { label: string; icon: string }> = {
  goal: { label: 'Goal', icon: 'goals' },
  project: { label: 'Project', icon: 'projects' },
  learning: { label: 'Learning', icon: 'projects' },
  group: { label: 'Group', icon: 'users' },
};

export function Matrix({ open, openPlan }: { open: (t: Task) => void; openPlan: (p: Project) => void }) {
  const tasks = useTasks();
  const projects = useProjects();
  const goals = useGoals();
  const [over, setOver] = useState<Quadrant | null>(null);
  const [openSec, setOpenSec] = useState<Partial<Record<Quadrant, boolean>>>({});
  const [show, setShow] = useState<Show>(() => { try { return (localStorage.getItem('orbit.prio.show') as Show) || 'all'; } catch { return 'all'; } });
  const pickShow = (v: Show) => { setShow(v); try { localStorage.setItem('orbit.prio.show', v); } catch { /* ignore */ } };

  const steps = useMemo(() => prioritizedSteps(projects, goals), [projects, goals]);

  const groups = useMemo(() => {
    const g: Record<Quadrant, Item[]> = { first: [], second: [], third: [], eliminate: [] };
    if (show !== 'steps') tasks.filter((t) => t.status !== 'done').forEach((t) => g[quadrantOf(t)].push({ type: 'task', key: 't' + t.id, t, at: taskAt(t) }));
    if (show !== 'todos') steps.forEach((s) => g[s.priority].push({ type: 'step', key: 's' + s.key, s, at: s.at }));
    // soonest deadline first; no deadline last (to-dos then by importance)
    const tie = (a: Item, b: Item) => (a.type === 'task' && b.type === 'task' ? score(b.t) - score(a.t) : 0);
    QUADRANT_ORDER.forEach((k) => g[k].sort((a, b) => (a.at ?? Infinity) - (b.at ?? Infinity) || tie(a, b)));
    return g;
  }, [tasks, steps, show]);

  const moveTask = (t: Task, q: Quadrant) => {
    if (quadrantOf(t) === q) return;
    saveWithUndo('tasks', t, { ...t, ...quadrantValues(q) }, `Moved to ${QUADRANTS[q].label}: ${t.title}`);
  };
  const moveStep = (s: PrioStep, q: Quadrant) => {
    if (s.priority === q) return;
    setStepPriority(s.project, s.taskId, s.subId, q, `Moved to ${QUADRANTS[q].label}: ${s.name}`);
  };
  const onDrop = (q: Quadrant, e: React.DragEvent) => {
    e.preventDefault(); setOver(null);
    const key = e.dataTransfer.getData('text/plain');
    if (key.startsWith('step|')) { const s = steps.find((x) => x.key === key.slice(5)); if (s) moveStep(s, q); return; }
    const t = tasks.find((x) => x.id === key);
    if (t) moveTask(t, q);
  };

  return (
    <div className="view" style={{ maxWidth: 1000 }}>
      <ViewHead title="Priorities" sub="Most urgent at the top, soonest deadline first. Includes goal, project and group steps you gave a priority.">
        <div className="seg">
          <button className={show === 'all' ? 'on' : ''} onClick={() => pickShow('all')} data-tip="Your to-dos and every goal, project and group step that has a priority.">All</button>
          <button className={show === 'todos' ? 'on' : ''} onClick={() => pickShow('todos')} data-tip="Only your one-off to-dos.">To-dos</button>
          <button className={show === 'steps' ? 'on' : ''} onClick={() => pickShow('steps')} data-tip="Only tasks and sub-tasks from your goals, projects and group work.">Goal & project steps</button>
        </div>
        <button className="btn primary" onClick={() => openQuickAdd()}><Icon name="plus" size={16} /> Add</button>
      </ViewHead>
      <div className="prio-grid">
        {QUADRANT_ORDER.map((q) => {
          const meta = QUADRANTS[q];
          const list = groups[q];
          const expanded = openSec[q] ?? list.length > 0;
          return (
            <section key={q} className={`prio prio-${q}` + (over === q ? ' over' : '')}
              onDragOver={(e) => { e.preventDefault(); setOver(q); }} onDragLeave={() => setOver((o) => (o === q ? null : o))} onDrop={(e) => onDrop(q, e)}>
              <button className="prio-h" onClick={() => setOpenSec((s) => ({ ...s, [q]: !expanded }))} aria-expanded={expanded} data-tip={QUADRANT_TIPS[q]}>
                <span className="prio-dot" />
                <span className="prio-t"><b>{meta.label}</b><span>{meta.hint} · {meta.action}</span></span>
                <span className="prio-n">{list.length}</span>
                <span className="prio-chev" style={{ transform: expanded ? 'rotate(90deg)' : 'none' }}>›</span>
              </button>
              {expanded && (
                <div className="prio-list">
                  {list.map((it) => it.type === 'task'
                    ? <TaskItem key={it.key} t={it.t} q={q} open={open} move={moveTask} />
                    : <StepItem key={it.key} s={it.s} q={q} openPlan={openPlan} move={moveStep} />)}
                  {!list.length && <div className="prio-empty">Nothing here.</div>}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <p className="small muted" style={{ marginTop: 12 }}>
        A to-do moves up by itself as its deadline gets close. Goal, project and group steps appear here once you give them a priority (open the step and tap <b>Priority</b>), and keep the priority you chose. Finished items are in Done & history.
      </p>
      <button className="fab" aria-label="Add" onClick={() => openQuickAdd()}>+</button>
    </div>
  );
}

function MoveSelect({ q, name, onMove }: { q: Quadrant; name: string; onMove: (q: Quadrant) => void }) {
  return (
    <label className="move-sel" data-tip="Move it to another priority.">
      <span>Move ▾</span>
      <select value={q} aria-label={`Move ${name}`} onChange={(e) => onMove(e.target.value as Quadrant)}>
        {QUADRANT_ORDER.map((x) => <option key={x} value={x}>{x === q ? `✓ ${QUADRANTS[x].label}` : QUADRANTS[x].label}</option>)}
      </select>
    </label>
  );
}

function TaskItem({ t, q, open, move }: { t: Task; q: Quadrant; open: (t: Task) => void; move: (t: Task, q: Quadrant) => void }) {
  const cd = countdown(t.due, t.dueTime);
  const pend = t.requirements.filter((r) => !r.done).length;
  return (
    <div className="prio-item">
      <span className="drag" draggable title="Drag to another section" aria-hidden="true"
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; }}>⋮⋮</span>
      <Check on={false} round onClick={() => toggleDone(t)} label={`Mark ${t.title} done`} />
      <div className="prio-main" onClick={() => open(t)}>
        <div className="t-title">{t.title}</div>
        {(t.due || pend > 0) && (
          <div className="t-meta">
            {t.due && <span className={'chip ' + (cd.tone === 'over' ? 'over' : cd.tone === 'soon' ? 'soon' : '')}>
              <Icon name="clock" size={12} /><span className="nw">{deadlineText(t.due, t.dueTime)}</span>{cd.text && !cd.text.startsWith('Due') && <span className="nw">· {cd.text}</span>}</span>}
            {pend > 0 && <span className="chip">☐ {pend} needed</span>}
          </div>
        )}
      </div>
      <MoveSelect q={q} name={t.title} onMove={(x) => move(t, x)} />
    </div>
  );
}

function StepItem({ s, q, openPlan, move }: { s: PrioStep; q: Quadrant; openPlan: (p: Project) => void; move: (s: PrioStep, q: Quadrant) => void }) {
  const cd = countdown(s.due, s.dueTime);
  const k = KIND[s.project.kind];
  const from = `${k.label}: ${s.project.name}${s.parent ? ` · ${s.parent}` : ''}`;
  return (
    <div className="prio-item step">
      <span className="drag" draggable title="Drag to another section" aria-hidden="true"
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', 'step|' + s.key); e.dataTransfer.effectAllowed = 'move'; }}>⋮⋮</span>
      <Check on={false} round onClick={() => toggleStep(s.project, s.taskId, s.subId)} label={`Mark ${s.name} done`} />
      <div className="prio-main" onClick={() => openPlan(s.project)} data-tip={`From ${from}. Tap to open it there.`}>
        <div className="t-title">{s.name || 'Untitled step'}</div>
        <div className="t-meta">
          {s.due && <span className={'chip ' + (cd.tone === 'over' ? 'over' : cd.tone === 'soon' ? 'soon' : '')}>
            <Icon name="clock" size={12} /><span className="nw">{deadlineText(s.due, s.dueTime)}</span>{cd.text && !cd.text.startsWith('Due') && <span className="nw">· {cd.text}</span>}</span>}
          <span className="chip src"><Icon name={k.icon} size={12} /> <span className="ellipsis">{s.project.name}{s.parent ? ` · ${s.parent}` : ''}</span></span>
          {s.who && <span className="chip"><Icon name="users" size={12} /> {s.who}</span>}
          {s.subsTotal > 0 && <span className="chip" data-tip="Sub-tasks still open in this task.">{s.subsTotal - s.subsOpen}/{s.subsTotal} sub-tasks</span>}
        </div>
      </div>
      <MoveSelect q={q} name={s.name} onMove={(x) => move(s, x)} />
    </div>
  );
}
