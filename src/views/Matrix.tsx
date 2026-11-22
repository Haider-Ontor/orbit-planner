import { useMemo, useState } from 'react';
import { useTasks } from '../lib/hooks';
import { QUADRANTS, quadrantOf, quadrantValues, score, dueLabel, type Quadrant } from '../lib/priority';
import { save } from '../lib/db';
import { newTask } from '../lib/models';
import { ViewHead } from '../components/ui';
import { Icon } from '../components/icons';
import type { Task } from '../lib/types';

// Same arrangement as the reference matrix: top row High impact (Second | First),
// bottom row Low impact (Eliminate | Third); left = Neutral, right = Critical.
const LAYOUT: Quadrant[] = ['second', 'first', 'eliminate', 'third'];

export function Matrix({ open }: { open: (t: Task) => void }) {
  const tasks = useTasks();
  const [over, setOver] = useState<Quadrant | null>(null);
  const [showDone, setShowDone] = useState(false);
  const groups = useMemo(() => {
    const g: Record<Quadrant, Task[]> = { first: [], second: [], third: [], eliminate: [] };
    tasks.filter((t) => showDone || t.status !== 'done').forEach((t) => g[quadrantOf(t)].push(t));
    (Object.keys(g) as Quadrant[]).forEach((k) => g[k].sort((a, b) => score(b) - score(a)));
    return g;
  }, [tasks, showDone]);

  const moveTo = (t: Task, q: Quadrant) => save('tasks', { ...t, ...quadrantValues(q) });
  const onDrop = (q: Quadrant, e: React.DragEvent) => {
    e.preventDefault(); setOver(null);
    const id = e.dataTransfer.getData('text/plain');
    const t = tasks.find((x) => x.id === id);
    if (t && quadrantOf(t) !== q) moveTo(t, q);
  };

  return (
    <div className="view">
      <ViewHead title="Prioritization Matrix" sub="Drag tasks between quadrants. Deadlines push tasks right as they approach.">
        <label className="row small"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show done</label>
        <button className="btn primary" onClick={() => open(newTask({ impact: 4, urgency: 4 }))}><Icon name="plus" size={16} /> Task</button>
      </ViewHead>
      <div className="matrix-wrap">
        <div className="col-heads"><span>Neutral</span><span>Critical</span></div>
        <div className="axis-y">Impact / Potential Rewards &nbsp;→</div>
        <div className="matrix">
          {LAYOUT.map((q) => {
            const meta = QUADRANTS[q];
            return (
              <div key={q} className={'quad' + (over === q ? ' over' : '')} style={{ background: meta.color, color: meta.ink }}
                onDragOver={(e) => { e.preventDefault(); setOver(q); }} onDragLeave={() => setOver((o) => (o === q ? null : o))} onDrop={(e) => onDrop(q, e)}>
                <div className="quad-h"><b>{meta.label}</b><span>{meta.hint}</span><span className="n">{groups[q].length}</span></div>
                <div className="quad-list">
                  {groups[q].map((t) => {
                    const due = dueLabel(t);
                    const pend = t.requirements.filter((r) => !r.done).length;
                    return (
                      <div key={t.id} className="mcard" draggable onClick={() => open(t)}
                        onDragStart={(e) => { e.dataTransfer.setData('text/plain', t.id); e.currentTarget.classList.add('dragging'); }}
                        onDragEnd={(e) => e.currentTarget.classList.remove('dragging')}>
                        <div className="t" style={t.status === 'done' ? { textDecoration: 'line-through', opacity: .6 } : undefined}>{t.title}</div>
                        {(due.text || pend > 0) && (
                          <div className="m">
                            {due.text && <span className={'chip ' + due.tone}>{due.text}</span>}
                            {pend > 0 && <span className="chip">☐ {pend} needed</span>}
                          </div>
                        )}
                        <div className="quad-move" onClick={(e) => e.stopPropagation()}>
                          {LAYOUT.filter((x) => x !== q).map((x) => (
                            <button key={x} className="btn sm" style={{ padding: '2px 7px' }} onClick={() => moveTo(t, x)} title={'Move to ' + QUADRANTS[x].label}>
                              <i className="qdot" style={{ background: QUADRANTS[x].color }} /> {QUADRANTS[x].label.split(' ')[0]}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {!groups[q].length && <div style={{ opacity: .7, fontSize: 12.5, padding: '6px 2px' }}>Drop tasks here</div>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="axis-x">Importance / Urgency &nbsp;→</div>
      </div>
    </div>
  );
}
