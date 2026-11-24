import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from './ui';
import { Icon } from './icons';
import { today, addDays, parseDate, niceDate, niceTime } from '../lib/dates';
import { countdown, deadlineText, QUICK_TIMES } from '../lib/deadline';

/* One picker for every deadline in Orbit: "by which day, and by what time?"
 * Big buttons for the next days and common times; native pickers for the rest. */

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayLabel = (d: string) => {
  const t = today();
  if (d === t) return 'Today';
  if (d === addDays(t, 1)) return 'Tomorrow';
  const x = parseDate(d);
  return `${DOW[x.getDay()]} ${x.getDate()}`;
};

/** Days offered as buttons: the rest of `week` (a Monday) when it is given and
 *  not over yet, otherwise the next 7 days. */
function quickDays(week?: string): string[] {
  const t = today();
  if (week) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(week, i)).filter((d) => d >= t);
    if (days.length >= 2) return days;
  }
  return Array.from({ length: 7 }, (_, i) => addDays(t, i));
}

export function DeadlineSheet({ title, date, time, week, onSave, onClose }: {
  title?: string; date: string | null; time: string | null; week?: string;
  onSave: (date: string | null, time: string | null) => void; onClose: () => void;
}) {
  const [d, setD] = useState<string | null>(date ?? null);
  const [t, setT] = useState<string | null>(time ?? null);
  const days = quickDays(week);
  const otherDay = d && !days.includes(d);
  const otherTime = t && !QUICK_TIMES.some((q) => q.value === t);
  const cd = countdown(d, t);
  const save = () => { onSave(d, d ? t : null); onClose(); };

  return (
    <Modal title={title ? `Deadline · ${title}` : 'Deadline'} onClose={onClose} footer={<>
      {(date || time) && <button className="btn ghost danger" onClick={() => { onSave(null, null); onClose(); }}>Remove deadline</button>}
      <div className="grow" />
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={save} disabled={!d && !date}>Save</button>
    </>}>
      <div className="dl-q">
        <span className="dl-label">Finish by which day?</span>
        <div className="pills">
          {days.map((x) => <button key={x} className={d === x ? 'on' : ''} onClick={() => setD(x)}>{dayLabel(x)}</button>)}
          <label className={'pill-date' + (otherDay ? ' on' : '')}>
            <Icon name="calendar" size={14} />&nbsp;{otherDay ? niceDate(d) : 'Other date'}
            <input type="date" value={d ?? ''} aria-label="Pick another date" onChange={(e) => setD(e.target.value || null)} />
          </label>
        </div>
      </div>

      <div className={'dl-q' + (d ? '' : ' dim')}>
        <span className="dl-label">By what time?</span>
        <div className="pills">
          <button className={!t ? 'on' : ''} onClick={() => setT(null)} disabled={!d} data-tip="No set time: it counts as due at the end of that day (11:59 pm).">Any time that day</button>
          {QUICK_TIMES.map((q) => <button key={q.value} className={t === q.value ? 'on' : ''} disabled={!d} onClick={() => setT(q.value)}>{q.label}</button>)}
          <label className={'pill-date' + (otherTime ? ' on' : '') + (d ? '' : ' disabled')}>
            <Icon name="clock" size={14} />&nbsp;{otherTime ? niceTime(t) : 'Other time'}
            <input type="time" value={t ?? ''} disabled={!d} aria-label="Pick another time" onChange={(e) => setT(e.target.value || null)} />
          </label>
        </div>
      </div>

      <div className={'dl-preview' + (cd.tone ? ' ' + cd.tone : '')}>
        {d ? <>
          <b>Due {deadlineText(d, t) || ''}{!t ? ' (end of day)' : ''}</b>
          {cd.text && <span>{cd.text}</span>}
        </> : <span className="muted">Pick a day. The time is optional: leave it as “Any time that day” if it doesn’t matter.</span>}
      </div>
    </Modal>
  );
}

/** A small chip that shows a deadline ("Wed 26 · 9am · in 1 day") and opens the picker. */
export function DeadlineChip({ date, time, done, week, name, placeholder = 'Deadline', onChange, showCountdown = true, tip, prefix }: {
  date: string | null; time?: string | null; done?: boolean; week?: string; name?: string; placeholder?: string;
  onChange: (date: string | null, time: string | null) => void; showCountdown?: boolean; tip?: string; prefix?: string;
}) {
  const [open, setOpen] = useState(false);
  const cd = countdown(date, time, !!done);
  return (
    <>
      <button type="button" className={'date-chip dl-chip' + (date ? '' : ' empty') + (cd.tone === 'over' ? ' late' : cd.tone === 'soon' ? ' soon' : '')}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }} aria-label={date ? `Deadline ${deadlineText(date, time)}, change` : `Choose a deadline${name ? ` for ${name}` : ''}`}
        data-tip={tip ?? (date ? `${done ? 'Was due' : 'Must be done by'} ${deadlineText(date, time)}${time ? '' : ' (end of day)'}. Tap to change the day or time.` : 'Pick the day it must be done by, and a time if it matters (e.g. 9 am before an exam).')}>
        {date ? <>
          <Icon name="clock" size={12} />
          <span>{prefix}{deadlineText(date, time)}</span>
          {showCountdown && cd.text && !done && <em>{cd.text}</em>}
        </> : <span>{placeholder}</span>}
      </button>
      {open && createPortal(
        // in its own layer, so clicks in the sheet never reach the row behind it
        <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
          <DeadlineSheet title={name} date={date} time={time ?? null} week={week} onSave={onChange} onClose={() => setOpen(false)} />
        </div>, document.body)}
    </>
  );
}
