import { useMemo, useState } from 'react';
import { useTasks, useProjects } from '../lib/hooks';
import { score, quadrantOf, QUADRANTS, type Quadrant } from '../lib/priority';
import { openQuickAdd } from '../components/QuickAdd';
import { TaskRow } from '../components/TaskRow';
import { ViewHead } from '../components/ui';
import { Icon } from '../components/icons';
import type { Task } from '../lib/types';

type Filter = 'active' | 'done' | 'all';
type Sort = 'priority' | 'due' | 'new';

export function Tasks({ open }: { open: (t: Task) => void }) {
  const tasks = useTasks();
  const projects = useProjects();
  const pmap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const [filter, setFilter] = useState<Filter>('active');
  const [sort, setSort] = useState<Sort>('priority');
  const [q, setQ] = useState('');
  const [proj, setProj] = useState('');
  const [quad, setQuad] = useState<Quadrant | ''>('');

  const list = useMemo(() => {
    let l = tasks.filter((t) => (filter === 'all' ? true : filter === 'done' ? t.status === 'done' : t.status !== 'done'));
    if (q) { const s = q.toLowerCase(); l = l.filter((t) => (t.title + ' ' + t.details + ' ' + t.requirements.map((r) => r.text).join(' ')).toLowerCase().includes(s)); }
    if (proj) l = l.filter((t) => (proj === '-' ? !t.projectId : t.projectId === proj));
    if (quad) l = l.filter((t) => quadrantOf(t) === quad);
    if (sort === 'priority') l.sort((a, b) => score(b) - score(a));
    else if (sort === 'due') l.sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || (a.dueTime ?? '').localeCompare(b.dueTime ?? ''));
    else l.sort((a, b) => b.createdAt - a.createdAt);
    if (filter === 'done') l.sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0));
    return l;
  }, [tasks, filter, sort, q, proj, quad]);

  return (
    <div className="view">
      <ViewHead title="All tasks" sub={`${tasks.filter((t) => t.status !== 'done').length} open · ${tasks.filter((t) => t.status === 'done').length} done`}>
        <button className="btn primary" onClick={() => openQuickAdd()}><Icon name="plus" size={16} /> Add</button>
      </ViewHead>
      <div className="toolbar">
        <input className="input" style={{ maxWidth: 260 }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg">{(['active', 'done', 'all'] as Filter[]).map((f) => <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>)}</div>
        <div className="seg">{(['priority', 'due', 'new'] as Sort[]).map((f) => <button key={f} className={sort === f ? 'on' : ''} onClick={() => setSort(f)}>{f === 'priority' ? 'Priority' : f === 'due' ? 'Deadline' : 'Newest'}</button>)}</div>
        <select className="select" style={{ width: 'auto' }} value={proj} onChange={(e) => setProj(e.target.value)}>
          <option value="">All projects</option><option value="-">No project</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="select" style={{ width: 'auto' }} value={quad} onChange={(e) => setQuad(e.target.value as Quadrant | '')}>
          <option value="">All priorities</option>
          {(Object.keys(QUADRANTS) as Quadrant[]).map((k) => <option key={k} value={k}>{QUADRANTS[k].label}</option>)}
        </select>
      </div>
      <div className="card"><div className="card-b" style={{ padding: 8 }}>
        {list.length ? list.map((t) => <TaskRow key={t.id} t={t} projects={pmap} onOpen={open} />) : <div className="empty">No tasks match.</div>}
      </div></div>
      <button className="fab" aria-label="Add" onClick={() => openQuickAdd()}>+</button>
    </div>
  );
}
