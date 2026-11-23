import { useMemo, useState } from 'react';
import { useProjects, useTasks, useNotes } from '../lib/hooks';
import { save } from '../lib/db';
import { removeWithUndo, saveWithUndo } from '../lib/undo';
import { newProject, projectProgress, stepCounts, deadlinesOf, newTask } from '../lib/models';
import { PlanEditor } from '../components/Plan';
import { TaskRow } from '../components/TaskRow';
import { ViewHead, Progress, Modal } from '../components/ui';
import { Icon } from '../components/icons';
import { niceDate, today } from '../lib/dates';
import type { Project, Task } from '../lib/types';

export function Projects({ open, projectId, setProjectId }: { open: (t: Task) => void; projectId: string | null; setProjectId: (id: string | null) => void }) {
  const projects = useProjects();
  const [creating, setCreating] = useState(false);
  const [kindFilter, setKindFilter] = useState<'all' | 'project' | 'learning' | 'archived'>('all');
  const current = projects.find((p) => p.id === projectId);
  if (current) return <ProjectDetail p={current} open={open} back={() => setProjectId(null)} />;

  const shown = projects.filter((p) => p.kind !== 'goal' && (kindFilter === 'archived' ? p.archived : !p.archived && (kindFilter === 'all' || p.kind === kindFilter)));
  return (
    <div className="view">
      <ViewHead title="Projects & learning" sub="Break each project into tasks and sub-tasks with deadlines.">
        <div className="seg">{(['all', 'project', 'learning', 'archived'] as const).map((k) => <button key={k} className={kindFilter === k ? 'on' : ''} onClick={() => setKindFilter(k)}>{k === 'all' ? 'All' : k === 'project' ? 'Projects' : k === 'learning' ? 'Learning' : 'Archived'}</button>)}</div>
        <button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" size={16} /> New</button>
      </ViewHead>
      <div className="proj-grid">
        {shown.map((p) => {
          const pr = projectProgress(p);
          const { done, total } = stepCounts(p);
          const dl = deadlinesOf([p]);
          const late = dl.filter((d) => d.due < today()).length;
          const next = dl.find((d) => d.due >= today());
          return (
            <div key={p.id} className="card proj" onClick={() => setProjectId(p.id)}>
              <div className="row"><span className="chip">{p.kind === 'learning' ? 'Learning' : 'Project'}</span><span style={{ flex: 1 }} />
                {late > 0 && <span className="chip over">{late} overdue</span>}
                {total > 0 && pr >= 100 && <span className="chip ok">Complete</span>}
              </div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</div>
              <Progress value={pr} />
              <div className="row small muted"><span>{total ? `${done}/${total} steps · ${pr}%` : 'No steps yet'}</span><span style={{ flex: 1 }} />
                {next && <span>Next: {niceDate(next.due)}</span>}
              </div>
              {next && <div className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>→ {next.name}</div>}
            </div>
          );
        })}
        {!shown.length && <div className="card"><div className="empty" style={{ padding: 24 }}>{kindFilter === 'archived' ? 'No archived projects.' : <>No projects yet. Tap <b>New</b> to start one.</>}</div></div>}
      </div>
      {creating && <NewProject onClose={(id) => { setCreating(false); if (id) setProjectId(id); }} />}
      <button className="fab" aria-label="New project" onClick={() => setCreating(true)}>+</button>
    </div>
  );
}

function NewProject({ onClose }: { onClose: (id?: string) => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'project' | 'learning'>('project');
  const ok = async () => {
    if (!name.trim()) return;
    const p = newProject({ name: name.trim(), kind });
    await save('projects', p);
    onClose(p.id);
  };
  return (
    <Modal title="New project or learning track" onClose={() => onClose()} footer={<><div className="grow" /><button className="btn" onClick={() => onClose()}>Cancel</button><button className="btn primary" onClick={ok}>Create</button></>}>
      <input className="input" autoFocus placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ok()} />
      <div className="seg" style={{ alignSelf: 'flex-start' }}>
        <button className={kind === 'project' ? 'on' : ''} onClick={() => setKind('project')}>Project</button>
        <button className={kind === 'learning' ? 'on' : ''} onClick={() => setKind('learning')}>Learning / course</button>
      </div>
    </Modal>
  );
}

function ProjectDetail({ p, open, back }: { p: Project; open: (t: Task) => void; back: () => void }) {
  const tasks = useTasks();
  const notes = useNotes();
  const linked = useMemo(() => tasks.filter((t) => t.projectId === p.id), [tasks, p.id]);
  const pnotes = notes.filter((n) => n.projectId === p.id);
  const pmap = useMemo(() => new Map([[p.id, p]]), [p]);
  const [renaming, setRenaming] = useState(false);

  return (
    <div className="view" style={{ maxWidth: 900 }}>
      <div className="view-head">
        <button className="btn ghost" onClick={back}><Icon name="back" size={16} /> Projects</button>
        <div className="grow" />
        <button className="btn sm" onClick={() => setRenaming(true)}>Edit</button>
        <button className="btn sm danger" onClick={async () => { if (confirm(`Delete "${p.name}"? You can restore it from Done & history → Recently deleted.`)) { await removeWithUndo('projects', p.id, p.name); back(); } }}>Delete</button>
      </div>
      <h1 style={{ margin: '0 0 14px', fontSize: 22, overflowWrap: 'anywhere' }}>{p.name}</h1>
      <div className="card" style={{ padding: 14 }}>
        <PlanEditor project={p} onChange={(next) => save('projects', next)} />
      </div>

      <div className="grid2" style={{ marginTop: 16, alignItems: 'start' }}>
        <div className="card">
          <div className="card-h">Linked to-dos<span className="grow" /><button className="btn sm" onClick={() => open(newTask({ projectId: p.id }))}><Icon name="plus" size={14} /> To-do</button></div>
          <div className="card-b">{linked.length ? linked.sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done')).map((t) => <TaskRow key={t.id} t={t} projects={pmap} onOpen={open} />) : <div className="empty">Day-to-day to-dos (meetings, forms) linked to this project appear here.</div>}</div>
        </div>
        <div className="card">
          <div className="card-h">Notes</div>
          <div className="card-b">{pnotes.length ? pnotes.map((n) => <div key={n.id} className="trow"><div className="t-main"><div className="t-title">{n.title || 'Untitled'}</div><div className="small muted">{n.body.slice(0, 120)}</div></div></div>) : <div className="empty">Notes assigned to this project appear here.</div>}</div>
        </div>
      </div>
      {renaming && <EditProject p={p} onClose={() => setRenaming(false)} />}
    </div>
  );
}

function EditProject({ p, onClose }: { p: Project; onClose: () => void }) {
  const [name, setName] = useState(p.name);
  const [kind, setKind] = useState(p.kind);
  const ok = async () => { await save('projects', { ...p, name: name.trim() || p.name, kind }); onClose(); };
  return (
    <Modal title="Edit project" onClose={onClose} footer={<>
      <button className="btn" onClick={async () => { await saveWithUndo('projects', p, { ...p, archived: !p.archived }, p.archived ? `Unarchived: ${p.name}` : `Archived: ${p.name} (see Projects → Archived)`); onClose(); }}>{p.archived ? 'Unarchive' : 'Archive'}</button>
      <div className="grow" /><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={ok}>Save</button></>}>
      <label className="field">Name<input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
      {p.kind !== 'goal' && (
        <div className="seg" style={{ alignSelf: 'flex-start' }}>
          <button className={kind === 'project' ? 'on' : ''} onClick={() => setKind('project')}>Project</button>
          <button className={kind === 'learning' ? 'on' : ''} onClick={() => setKind('learning')}>Learning / course</button>
        </div>
      )}
    </Modal>
  );
}
