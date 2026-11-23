import { useState } from 'react';
import { useRoutines } from '../lib/hooks';
import { save } from '../lib/db';
import { removeWithUndo } from '../lib/undo';
import { newRoutine, toggleRoutineDay } from '../lib/models';
import { today, addDays, parseDate, niceTime, dowName } from '../lib/dates';
import { isDueOn, streak, completionRate, describe } from '../lib/recurrence';
import { Modal, ViewHead } from '../components/ui';
import { Icon } from '../components/icons';
import type { Routine, RoutineFreq } from '../lib/types';

export function Routines() {
  const routines = useRoutines();
  const [edit, setEdit] = useState<{ r: Routine; isNew: boolean } | null>(null);
  const t0 = today();
  const days = Array.from({ length: 7 }, (_, i) => addDays(t0, i - 6));
  const cats = Array.from(new Set(routines.map((r) => r.category || 'General'))).sort();

  return (
    <div className="view">
      <ViewHead title="Repeating tasks" sub="Things you do every day or on certain days: water the plants, gym, review notes. Tick them off on Today.">
        <button className="btn primary" onClick={() => setEdit({ r: newRoutine(), isNew: true })}><Icon name="plus" size={16} /> Add</button>
      </ViewHead>
      {cats.map((cat) => (
        <div className="card" key={cat} style={{ marginBottom: 16 }}>
          <div className="card-h">{cat}</div>
          <div className="rt head">
            <span />
            {days.map((d) => <span key={d} style={{ textAlign: 'center' }}>{dowName(parseDate(d).getDay()).slice(0, 2)}<br />{parseDate(d).getDate()}</span>)}
            <span className="streak hide-sm">Streak</span>
          </div>
          {routines.filter((r) => (r.category || 'General') === cat).map((r) => {
            const st = streak(r);
            return (
              <div className="rt" key={r.id}>
                <div style={{ cursor: 'pointer', minWidth: 0 }} onClick={() => setEdit({ r, isNew: false })}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</div>
                  <div className="small muted">{describe(r)}{r.time ? ' · ' + niceTime(r.time) : ''} · {Math.round(completionRate(r) * 100)}% (30d)</div>
                </div>
                {days.map((d) => {
                  const due = isDueOn(r, d);
                  return (
                    <button key={d} className={'day' + (r.log[d] ? ' on' : '') + (!due ? ' na' : '') + (d === t0 ? ' today' : '')}
                      disabled={!due} aria-label={`${r.title} ${d}`} onClick={() => toggleRoutineDay(r, d)}>
                      {r.log[d] ? '✓' : ''}
                    </button>
                  );
                })}
                <span className="streak">{st > 0 ? `🔥 ${st}` : '—'}</span>
              </div>
            );
          })}
        </div>
      ))}
      {!routines.length && <div className="card"><div className="empty" style={{ padding: 24 }}>Nothing repeating yet. Tap Add and choose the days.</div></div>}
      {edit && <RoutineEditor r={edit.r} isNew={edit.isNew} cats={cats} onClose={() => setEdit(null)} />}
      <button className="fab" aria-label="New routine" onClick={() => setEdit({ r: newRoutine(), isNew: true })}>+</button>
    </div>
  );
}

function RoutineEditor({ r: init, isNew, cats, onClose }: { r: Routine; isNew: boolean; cats: string[]; onClose: () => void }) {
  const [r, setR] = useState(init);
  const up = (p: Partial<Routine>) => setR((c) => ({ ...c, ...p }));
  const ok = async () => { if (r.title.trim()) await save('routines', { ...r, title: r.title.trim() }); onClose(); };
  return (
    <Modal title={isNew ? 'New routine' : 'Routine'} onClose={onClose} footer={<>
      {!isNew && <button className="btn danger" onClick={async () => { await removeWithUndo('routines', r.id, r.title); onClose(); }}>Delete</button>}
      <div className="grow" /><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={ok}>Save</button>
    </>}>
      <input className="input" autoFocus placeholder="e.g. Review lecture notes" value={r.title} onChange={(e) => up({ title: e.target.value })} />
      <div className="grid2">
        <label className="field">Repeats
          <select className="select" value={r.freq} onChange={(e) => up({ freq: e.target.value as RoutineFreq })}>
            <option value="daily">Every day</option><option value="weekdays">Weekdays</option><option value="weekly">Specific days</option><option value="interval">Every N days</option>
          </select>
        </label>
        <label className="field">Reminder time (optional)<input className="input" type="time" value={r.time ?? ''} onChange={(e) => up({ time: e.target.value || null })} /></label>
      </div>
      {r.freq === 'weekly' && (
        <div className="row wrap">{[1, 2, 3, 4, 5, 6, 0].map((d) => (
          <button key={d} className={'btn sm' + (r.days.includes(d) ? ' primary' : '')} onClick={() => up({ days: r.days.includes(d) ? r.days.filter((x) => x !== d) : [...r.days, d] })}>{dowName(d)}</button>
        ))}</div>
      )}
      {r.freq === 'interval' && <label className="field">Every how many days<input className="input" type="number" min={1} value={r.every} onChange={(e) => up({ every: Math.max(1, +e.target.value || 1) })} /></label>}
      <div className="grid2">
        <label className="field">Category
          <input className="input" list="cats" value={r.category} onChange={(e) => up({ category: e.target.value })} />
          <datalist id="cats">{[...new Set([...cats, 'Study', 'Health', 'Planning', 'Work', 'Learning'])].map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <label className="field">Starts<input className="input" type="date" value={r.startDate} onChange={(e) => up({ startDate: e.target.value || today() })} /></label>
      </div>
      <label className="row small"><input type="checkbox" checked={r.archived} onChange={(e) => up({ archived: e.target.checked })} /> Paused (hide from today)</label>
    </Modal>
  );
}
