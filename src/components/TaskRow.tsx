import type { Task, Project } from '../lib/types';
import { saveWithUndo, doneMsg } from '../lib/undo';
import { QUADRANTS, quadrantOf, dueLabel } from '../lib/priority';
import { niceDate, niceTime, timeOfISO } from '../lib/dates';
import { Check } from './ui';

/** Tick / untick a to-do, with Undo. Finished to-dos stay listed under Done. */
export function toggleDone(t: Task) {
  const done = t.status !== 'done';
  return saveWithUndo('tasks', t, { ...t, status: done ? 'done' : 'todo', doneAt: done ? Date.now() : null }, doneMsg(t.title, done));
}

export function TaskRow({ t, projects, onOpen, showQuadrant = true }: { t: Task; projects?: Map<string, Project>; onOpen: (t: Task) => void; showQuadrant?: boolean }) {
  const q = QUADRANTS[quadrantOf(t)];
  const due = dueLabel(t);
  const reqTotal = t.requirements.length;
  const reqDone = t.requirements.filter((r) => r.done).length;
  const proj = t.projectId ? projects?.get(t.projectId) : undefined;
  return (
    <div className={'trow' + (t.status === 'done' ? ' done' : '')} onClick={() => onOpen(t)}>
      <Check on={t.status === 'done'} onClick={() => toggleDone(t)} round />
      <div className="t-main">
        <div className="t-title">{t.title || <span className="muted">Untitled</span>}</div>
        <div className="t-meta">
          {showQuadrant && t.status !== 'done' && <span className="chip" title={q.hint}><i className="qdot" style={{ background: q.color }} />{q.label}</span>}
          {t.status !== 'done' && due.text && <span className={'chip ' + due.tone}>{due.text}</span>}
          {t.start && <span className="chip">{niceDate(t.start.slice(0, 10))} {niceTime(timeOfISO(t.start))}</span>}
          {!t.start && t.due && <span className="chip">{niceDate(t.due)}{t.dueTime ? ' · ' + niceTime(t.dueTime) : ''}</span>}
          {reqTotal > 0 && <span className={'chip' + (reqDone === reqTotal ? ' ok' : '')}>☑ {reqDone}/{reqTotal} needed</span>}
          {t.status === 'doing' && <span className="chip ok">In progress</span>}
          {proj && <span className="chip">{proj.name}</span>}
          {t.source === 'ai' && <span className="chip" title="Added by smart capture">✨</span>}
          {t.gcalEventId && <span className="chip" title="On Google Calendar">📅</span>}
        </div>
      </div>
    </div>
  );
}
