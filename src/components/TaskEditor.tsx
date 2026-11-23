import { useState } from 'react';
import type { Task, Project } from '../lib/types';
import { save, uid } from '../lib/db';
import { removeWithUndo } from '../lib/undo';
import { QUADRANTS, quadrantOf } from '../lib/priority';
import { openLink } from '../lib/platform';
import { Modal, Check } from './ui';
import { Icon } from './icons';

export function TaskEditor({ task, projects, onClose, isNew }: { task: Task; projects: Project[]; onClose: () => void; isNew?: boolean }) {
  const [t, setT] = useState<Task>(task);
  const [req, setReq] = useState('');
  const [mode, setMode] = useState<'deadline' | 'event'>(task.start ? 'event' : 'deadline');
  const up = (p: Partial<Task>) => setT((cur) => ({ ...cur, ...p }));
  const q = QUADRANTS[quadrantOf(t)];

  const commit = async () => {
    if (!t.title.trim()) { onClose(); return; }
    const out = { ...t, title: t.title.trim() };
    if (mode === 'deadline') out.start = null;
    else if (out.start) { out.due = out.start.slice(0, 10); out.dueTime = null; }
    await save('tasks', out);
    onClose();
  };
  const addReq = () => {
    if (!req.trim()) return;
    up({ requirements: [...t.requirements, { id: uid(), text: req.trim(), done: false }] });
    setReq('');
  };

  return (
    <Modal title={isNew ? 'New task' : 'Task'} onClose={commit}
      footer={<>
        {!isNew && <button className="btn danger" onClick={async () => { await removeWithUndo('tasks', t.id, t.title || 'task'); onClose(); }}><Icon name="trash" size={15} /> Delete</button>}
        <div className="grow" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={commit}>Save</button>
      </>}>
      <input className="input" style={{ fontSize: 16, fontWeight: 600 }} autoFocus={isNew} placeholder="What needs doing?"
        value={t.title} onChange={(e) => up({ title: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') commit(); }} />
      <textarea className="textarea" placeholder="Details, context, notes…" value={t.details} onChange={(e) => up({ details: e.target.value })} style={{ minHeight: 70 }} />

      <div className="row wrap">
        <div className="seg">
          <button className={mode === 'deadline' ? 'on' : ''} onClick={() => setMode('deadline')}>Deadline</button>
          <button className={mode === 'event' ? 'on' : ''} onClick={() => setMode('event')}>Scheduled time</button>
        </div>
        <div className="seg">
          {(['todo', 'doing', 'done'] as const).map((s) => (
            <button key={s} className={t.status === s ? 'on' : ''} onClick={() => up({ status: s, doneAt: s === 'done' ? Date.now() : null })}>
              {s === 'todo' ? 'To do' : s === 'doing' ? 'In progress' : 'Done'}
            </button>
          ))}
        </div>
      </div>

      {mode === 'deadline' ? (
        <div className="grid2">
          <label className="field">Due date<input className="input" type="date" value={t.due ?? ''} onChange={(e) => up({ due: e.target.value || null })} /></label>
          <label className="field">Time (optional)<input className="input" type="time" value={t.dueTime ?? ''} onChange={(e) => up({ dueTime: e.target.value || null })} /></label>
        </div>
      ) : (
        <div className="grid2">
          <label className="field">Starts<input className="input" type="datetime-local" value={t.start ?? ''} onChange={(e) => up({ start: e.target.value || null })} /></label>
          <label className="field">Duration (min)<input className="input" type="number" min={5} step={5} value={t.durationMin ?? 60} onChange={(e) => up({ durationMin: Number(e.target.value) || null })} /></label>
        </div>
      )}

      <div className="card" style={{ padding: 12, boxShadow: 'none' }}>
        <div className="row" style={{ marginBottom: 8 }}>
          <i className="qdot" style={{ background: q.color, width: 12, height: 12 }} /><b>{q.label}</b><span className="muted small">{q.hint}</span>
        </div>
        <div className="grid2">
          <label className="field">Impact / potential reward
            <div className="slider-row"><span className="small muted">Low</span><input type="range" min={1} max={5} value={t.impact} onChange={(e) => up({ impact: +e.target.value })} /><span className="small muted">High</span><b>{t.impact}</b></div>
          </label>
          <label className="field">Importance / urgency
            <div className="slider-row"><span className="small muted">Neutral</span><input type="range" min={1} max={5} value={t.urgency} onChange={(e) => up({ urgency: +e.target.value })} /><span className="small muted">Critical</span><b>{t.urgency}</b></div>
          </label>
        </div>
        <div className="small muted" style={{ marginTop: 6 }}>Urgency rises on its own as the deadline gets close.</div>
      </div>

      <div>
        <div className="field" style={{ marginBottom: 6 }}><span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-2)' }}>What you need to complete it</span></div>
        {t.requirements.map((r) => (
          <div className="req" key={r.id}>
            <Check on={r.done} onClick={() => up({ requirements: t.requirements.map((x) => (x.id === r.id ? { ...x, done: !x.done } : x)) })} />
            <span style={{ flex: 1, textDecoration: r.done ? 'line-through' : 'none', color: r.done ? 'var(--ink-3)' : undefined }}>{r.text}</span>
            <button className="btn ghost sm" onClick={() => up({ requirements: t.requirements.filter((x) => x.id !== r.id) })} aria-label="Remove"><Icon name="x" size={14} /></button>
          </div>
        ))}
        <div className="row" style={{ marginTop: 6 }}>
          <input className="input" placeholder="e.g. Passport scan, application fee, referee email…" value={req}
            onChange={(e) => setReq(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addReq(); }} />
          <button className="btn" onClick={addReq}>Add</button>
        </div>
      </div>

      <div className="grid2">
        <label className="field">Project
          <select className="select" value={t.projectId ?? ''} onChange={(e) => up({ projectId: e.target.value || null })}>
            <option value="">None</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="field">Links (one per line)
          <textarea className="textarea" style={{ minHeight: 40 }} value={t.links.join('\n')} onChange={(e) => up({ links: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} />
        </label>
      </div>
      {t.links.length > 0 && (
        <div className="row wrap">{t.links.map((l) => <button key={l} className="btn sm" onClick={() => openLink(l)}><Icon name="link" size={13} /> {l.replace(/^https?:\/\//, '').slice(0, 40)}</button>)}</div>
      )}
    </Modal>
  );
}
