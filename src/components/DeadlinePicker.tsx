import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from './ui';
import { Icon } from './icons';
import { DateField, TimeField } from './DateTime';
import { today, addDays, parseDate } from '../lib/dates';
import { countdown, deadlineText, deadlineMs, parseWhen, QUICK_TIMES } from '../lib/deadline';

/* One picker for every deadline in Orbit: "by which day, and by what time?"
 * Three ways to set it, all in the same sheet:
 *  - type it in words ("fri 5pm", "28/11 9:30", "yesterday"),
 *  - type or pick in the Day and Time boxes (calendar / clock),
 *  - tap a quick day and a quick time.
 * Any date works, including past ones (for something that is already overdue). */

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dayLabel = (d: string) => {
  const t = today();
  if (d === t) return 'Today';
  if (d === addDays(t, 1)) return 'Tomorrow';
  if (d === addDays(t, -1)) return 'Yesterday';
  const x = parseDate(d);
  return `${DOW[x.getDay()]} ${x.getDate()}`;
};

/** Days offered as buttons: yesterday, today and the next 6 days; or the days
 *  of `week` (a Monday) when that week is further ahead. */
function quickDays(week?: string): string[] {
  const t = today();
  if (week && week > addDays(t, 6)) return Array.from({ length: 7 }, (_, i) => addDays(week, i));
  return Array.from({ length: 8 }, (_, i) => addDays(t, i - 1));
}

export function DeadlineSheet({ title, date, time, week, onSave, onClose }: {
  title?: string; date: string | null; time: string | null; week?: string;
  onSave: (date: string | null, time: string | null) => void; onClose: () => void;
}) {
  const [d, setD] = useState<string | null>(date ?? null);
  const [t, setT] = useState<string | null>(time ?? null);
  const [typed, setTyped] = useState('');
  const parsed = typed.trim() ? parseWhen(typed) : null;
  const days = quickDays(week);
  const cd = countdown(d, t);
  const past = d ? (deadlineMs(d, t) ?? 0) < Date.now() : false;
  const save = () => { onSave(d, d ? t : null); onClose(); };
  const type = (v: string) => {
    setTyped(v);
    const p = v.trim() ? parseWhen(v) : null;
    if (p) { setD(p.date); setT(p.time); }
  };
  // a time needs a day: picking one first assumes today
  const pickTime = (v: string | null) => { setT(v); if (v && !d) setD(today()); setTyped(''); };
  const pickDay = (v: string | null) => { setD(v); setTyped(''); };

  return (
    <Modal title={title ? `Deadline · ${title}` : 'Deadline'} onClose={onClose} footer={<>
      {(date || time) && <button className="btn ghost danger" onClick={() => { onSave(null, null); onClose(); }}>Remove deadline</button>}
      <div className="grow" />
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={save} disabled={!d && !date}>Save</button>
    </>}>
      <div className="dl-type">
        <input className="input" value={typed} onChange={(e) => type(e.target.value)} aria-label="Type the day and time"
          placeholder="Type it, e.g. fri 5pm · 28/11 9:30 · yesterday"
          onKeyDown={(e) => { if (e.key === 'Enter' && d) save(); }}
          data-tip="Write the deadline in your own words: today, tomorrow, yesterday, a weekday (fri, next mon), a date (28/11, 25 Nov 2026) and a time (9am, 17:30). Past dates are fine." />
        {typed.trim() && (
          parsed
            ? <span className="small dl-read"><Icon name="check" size={13} /> {deadlineText(parsed.date, parsed.time)}{parsed.time ? '' : ' (any time that day)'}</span>
            : <span className="small dl-unread">Couldn't read that yet. Try “fri 5pm”, “28/11 9:30” or “tomorrow”.</span>
        )}
      </div>

      <div className="dl-fields">
        <div className="field"><span>Day</span><DateField value={d} onChange={pickDay} label="Day" /></div>
        <div className="field"><span>Time <span className="muted">(optional)</span></span><TimeField value={t} onChange={pickTime} label="Time" clearable /></div>
      </div>

      <div className="dl-q">
        <span className="dl-label">Quick day</span>
        <div className="pills">
          {days.map((x) => <button key={x} className={d === x ? 'on' : ''} onClick={() => pickDay(x)}>{dayLabel(x)}</button>)}
        </div>
      </div>

      <div className="dl-q">
        <span className="dl-label">Quick time</span>
        <div className="pills">
          <button className={d && !t ? 'on' : ''} onClick={() => pickTime(null)} data-tip="No set time: it counts as due at the end of that day (11:59 pm).">Any time</button>
          {QUICK_TIMES.map((q) => <button key={q.value} className={t === q.value ? 'on' : ''} onClick={() => pickTime(q.value)}>{q.label}</button>)}
        </div>
      </div>

      <div className={'dl-preview' + (cd.tone ? ' ' + cd.tone : '')}>
        {d ? <>
          <b>Due {deadlineText(d, t) || ''}{!t ? ' (end of day)' : ''}</b>
          {cd.text && <span>{cd.text}</span>}
          {past && <span className="dl-past">That's already past, so it will show as overdue.</span>}
        </> : <span className="muted">Type it, pick a day, or tap a quick day. The time is optional.</span>}
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
