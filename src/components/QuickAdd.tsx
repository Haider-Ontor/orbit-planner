import { useState, useSyncExternalStore } from 'react';
import { save } from '../lib/db';
import { newTask, newRoutine } from '../lib/models';
import { today, addDays } from '../lib/dates';
import { Modal, toast } from './ui';
import type { Task } from '../lib/types';

/* The one "+" used everywhere. Plain questions, no jargon:
 * what · once or repeating (which days) · when · important? */

let openState: { repeat?: boolean } | null = null;
const subs = new Set<() => void>();
export function openQuickAdd(opts: { repeat?: boolean } = {}) { openState = opts; subs.forEach((f) => f()); }
function close() { openState = null; subs.forEach((f) => f()); }

const DAYS = [['M', 1], ['T', 2], ['W', 3], ['T', 4], ['F', 5], ['S', 6], ['S', 0]] as const;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function QuickAddHost({ onMore }: { onMore: (t: Task) => void }) {
  const state = useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => openState);
  return state ? <QuickAdd repeatFirst={!!state.repeat} onMore={onMore} /> : null;
}

function QuickAdd({ repeatFirst, onMore }: { repeatFirst: boolean; onMore: (t: Task) => void }) {
  const [title, setTitle] = useState('');
  const [repeat, setRepeat] = useState<'once' | 'daily' | 'days'>(repeatFirst ? 'daily' : 'once');
  const [days, setDays] = useState<number[]>([]);
  const [when, setWhen] = useState<'today' | 'tomorrow' | 'date' | 'none'>('today');
  const [date, setDate] = useState(addDays(today(), 2));
  const [time, setTime] = useState('');
  const [important, setImportant] = useState(false);

  const due = when === 'today' ? today() : when === 'tomorrow' ? addDays(today(), 1) : when === 'date' ? date : null;
  const draft = () => newTask({ title: title.trim(), due, dueTime: due && time ? time : null, impact: important ? 4 : 3, urgency: important ? 3 : 2 });
  const canAdd = title.trim().length > 0 && !(repeat === 'days' && !days.length);

  const add = async () => {
    if (!canAdd) return;
    if (repeat === 'once') {
      await save('tasks', draft());
      toast(`Added: ${title.trim()}`);
    } else {
      await save('routines', newRoutine({ title: title.trim(), freq: repeat === 'daily' ? 'daily' : 'weekly', days: repeat === 'days' ? days : [], time: time || null }));
      toast(repeat === 'daily' ? `Added: ${title.trim()} · every day` : `Added: ${title.trim()} · ${[...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAY_NAMES[d].slice(0, 3)).join(', ')}`);
    }
    close();
  };

  return (
    <Modal title="Add" onClose={close} footer={<>
      {repeat === 'once' && <button className="btn ghost" onClick={() => { const t = draft(); close(); onMore(t); }}>More options</button>}
      <div className="grow" />
      <button className="btn" onClick={close}>Cancel</button>
      <button className="btn primary" disabled={!canAdd} onClick={add}>Add</button>
    </>}>
      <input className="input big-in" autoFocus placeholder="What do you need to do?" value={title}
        onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />

      <div className="qa-row">
        <span className="qa-label">Repeat</span>
        <div className="pills">
          <button className={repeat === 'once' ? 'on' : ''} onClick={() => setRepeat('once')}>Just once</button>
          <button className={repeat === 'daily' ? 'on' : ''} onClick={() => setRepeat('daily')}>Every day</button>
          <button className={repeat === 'days' ? 'on' : ''} onClick={() => setRepeat('days')}>Some days</button>
        </div>
      </div>

      {repeat === 'days' && (
        <div className="qa-row">
          <span className="qa-label">On</span>
          <div className="day-chips big">
            {DAYS.map(([l, d], i) => (
              <button key={i} className={'day-chip' + (days.includes(d) ? ' on' : '')} aria-pressed={days.includes(d)} aria-label={DAY_NAMES[d]}
                onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}>{l}</button>
            ))}
          </div>
        </div>
      )}

      {repeat === 'once' && (
        <div className="qa-row">
          <span className="qa-label">When</span>
          <div className="pills">
            <button className={when === 'today' ? 'on' : ''} onClick={() => setWhen('today')}>Today</button>
            <button className={when === 'tomorrow' ? 'on' : ''} onClick={() => setWhen('tomorrow')}>Tomorrow</button>
            <label className={'pill-date' + (when === 'date' ? ' on' : '')}>
              {when === 'date' ? new Date(date + 'T12:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : 'Pick a date'}
              <input type="date" value={date} min={today()} onChange={(e) => { if (e.target.value) { setDate(e.target.value); setWhen('date'); } }} onClick={() => setWhen('date')} />
            </label>
            <button className={when === 'none' ? 'on' : ''} onClick={() => setWhen('none')}>No date</button>
          </div>
        </div>
      )}

      {(repeat !== 'once' || when !== 'none') && (
        <div className="qa-row">
          <span className="qa-label">Time</span>
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ width: 140 }} aria-label="Time (optional)" />
          <span className="small muted">optional, for a reminder</span>
        </div>
      )}

      {repeat === 'once' && (
        <label className="switch big">
          <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} />
          <span>Mark as important</span>
        </label>
      )}
    </Modal>
  );
}
