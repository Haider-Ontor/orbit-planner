import { useMemo, useState } from 'react';
import { useTasks } from '../lib/hooks';
import { QUADRANTS, QUADRANT_ORDER, quadrantOf, quadrantValues, score, dueLabel, type Quadrant, QUADRANT_TIPS } from '../lib/priority';
import { saveWithUndo } from '../lib/undo';
import { ViewHead } from '../components/ui';
import { Icon } from '../components/icons';
import { openQuickAdd } from '../components/QuickAdd';
import { toggleDone } from '../components/TaskRow';
import { Check } from '../components/ui';
import type { Task } from '../lib/types';

/* Priorities, stacked strictly from most to least urgent.
 * One way to move a task: the "Move" menu (works everywhere). On a computer
 * the ⋮⋮ handle can also be dragged onto another section. */

export function Matrix({ open }: { open: (t: Task) => void }) {
  const tasks = useTasks();
  const [over, setOver] = useState<Quadrant | null>(null);
  const [openSec, setOpenSec] = useState<Partial<Record<Quadrant, boolean>>>({});
  const groups = useMemo(() => {
    const g: Record<Quadrant, Task[]> = { first: [], second: [], third: [], eliminate: [] };
    tasks.filter((t) => t.status !== 'done').forEach((t) => g[quadrantOf(t)].push(t));
    QUADRANT_ORDER.forEach((k) => g[k].sort((a, b) => score(b) - score(a)));
    return g;
  }, [tasks]);

  const moveTo = (t: Task, q: Quadrant) => {
    if (quadrantOf(t) === q) return;
    saveWithUndo('tasks', t, { ...t, ...quadrantValues(q) }, `Moved to ${QUADRANTS[q].label}: ${t.title}`);
  };
  const onDrop = (q: Quadrant, e: React.DragEvent) => {
    e.preventDefault(); setOver(null);
    const t = tasks.find((x) => x.id === e.dataTransfer.getData('text/plain'));
    if (t) moveTo(t, q);
  };

  return (
    <div className="view" style={{ maxWidth: 1000 }}>
      <ViewHead title="Priorities" sub="Most urgent at the top. Use Move to change where a task belongs.">
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
                  {list.map((t) => {
                    const due = dueLabel(t);
                    const pend = t.requirements.filter((r) => !r.done).length;
                    return (
                      <div key={t.id} className="prio-item">
                        <span className="drag" draggable title="Drag to another section" aria-hidden="true"
                          onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; }}>⋮⋮</span>
                        <Check on={false} round onClick={() => toggleDone(t)} label={`Mark ${t.title} done`} />
                        <div className="prio-main" onClick={() => open(t)}>
                          <div className="t-title">{t.title}</div>
                          {(due.text || pend > 0) && (
                            <div className="t-meta">
                              {due.text && <span className={'chip ' + due.tone}>{due.text}</span>}
                              {pend > 0 && <span className="chip">☐ {pend} needed</span>}
                            </div>
                          )}
                        </div>
                        <label className="move-sel">
                          <span>Move ▾</span>
                          <select value={q} aria-label={`Move ${t.title}`} onChange={(e) => moveTo(t, e.target.value as Quadrant)}>
                            {QUADRANT_ORDER.map((x) => <option key={x} value={x}>{x === q ? `✓ ${QUADRANTS[x].label}` : QUADRANTS[x].label}</option>)}
                          </select>
                        </label>
                      </div>
                    );
                  })}
                  {!list.length && <div className="prio-empty">Nothing here.</div>}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <p className="small muted" style={{ marginTop: 12 }}>A task moves up by itself as its deadline gets close. Finished tasks are in Done & history.</p>
      <button className="fab" aria-label="Add" onClick={() => openQuickAdd()}>+</button>
    </div>
  );
}
