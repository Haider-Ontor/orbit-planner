import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';

/* Date and time boxes used everywhere in Orbit.
 * - Always visible, so you can type straight into them (e.g. 28/11/2026, 09:30).
 * - The button opens the calendar / clock to scroll and pick instead.
 * - Any date works, past or future: an overdue task can be added as overdue.
 * While a date is half-typed the browser reports it as empty; we keep what's
 * in the box and only pass on complete values, so typing is never wiped. */

function openPicker(el: HTMLInputElement | null) {
  if (!el) return;
  try { el.showPicker(); } catch { el.focus(); }
}

function useLocal(value: string | null | undefined) {
  const [local, setLocal] = useState(value ?? '');
  useEffect(() => { setLocal(value ?? ''); }, [value]);
  return [local, setLocal] as const;
}

interface FieldProps {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  label: string;            // read out by screen readers
  size?: 'sm';
  required?: boolean;       // never becomes empty (e.g. a start date)
  tip?: string;
}

/** A day: type it (dd/mm/yyyy in your format) or open the calendar. */
export function DateField({ value, onChange, label, size, required, tip }: FieldProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [local, setLocal] = useLocal(value);
  return (
    <span className={'dt-field' + (size ? ' ' + size : '')}>
      <input ref={ref} type="date" className="input" value={local} aria-label={label}
        onChange={(e) => { setLocal(e.target.value); if (e.target.value) onChange(e.target.value); }}
        onBlur={(e) => { if (!e.target.value) { if (required) setLocal(value ?? ''); else if (value) onChange(null); } }}
        onKeyDown={(e) => { if (e.key === 'F4' || (e.altKey && e.key === 'ArrowDown')) { e.preventDefault(); openPicker(ref.current); } }} />
      <button type="button" className="dt-btn" onClick={(e) => { e.preventDefault(); openPicker(ref.current); }} aria-label={`Open calendar for ${label}`}
        data-tip={tip ?? 'Open the calendar to pick a day. You can also type the date straight into the box. Past dates are fine.'}>
        <Icon name="calendar" size={size ? 14 : 16} />
      </button>
    </span>
  );
}

/** A time of day: type it (09:30) or open the clock. `clearable` adds "no time". */
export function TimeField({ value, onChange, label, size, required, tip, clearable }: FieldProps & { clearable?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [local, setLocal] = useLocal(value);
  return (
    <span className={'dt-field time' + (size ? ' ' + size : '') + (clearable && local ? ' has-clear' : '')}>
      <input ref={ref} type="time" className="input" value={local} aria-label={label}
        onChange={(e) => { setLocal(e.target.value); if (e.target.value) onChange(e.target.value); }}
        onBlur={(e) => { if (!e.target.value) { if (required) setLocal(value ?? ''); else if (value) onChange(null); } }}
        onKeyDown={(e) => { if (e.key === 'F4' || (e.altKey && e.key === 'ArrowDown')) { e.preventDefault(); openPicker(ref.current); } }} />
      {clearable && local && (
        <button type="button" className="dt-clear" onClick={(e) => { e.preventDefault(); setLocal(''); onChange(null); }} aria-label={`Clear ${label}`} data-tip="Remove the time (then it just counts as that day).">
          <Icon name="x" size={13} />
        </button>
      )}
      <button type="button" className="dt-btn" onClick={(e) => { e.preventDefault(); openPicker(ref.current); }} aria-label={`Open clock for ${label}`}
        data-tip={tip ?? 'Open the clock to pick a time. You can also type it, e.g. 09:30 or 17:00.'}>
        <Icon name="clock" size={size ? 14 : 16} />
      </button>
    </span>
  );
}
