import type { CSSProperties } from 'react';
import type { Member, StepPriority } from '../lib/types';
import { QUADRANTS, QUADRANT_ORDER } from '../lib/priority';
import { initials } from '../lib/models';

/* Small pieces shared by plans and group work:
 * a priority picker (same four levels and colours as the Priorities page),
 * a contributor's round avatar, and a "who is doing this" picker. */

export const prioLabel = (p: StepPriority | null | undefined) => (p ? QUADRANTS[p].label : '');

/** Shows the step's priority as a coloured chip; tap to change it. */
export function PriorityPick({ value, onChange, name }: { value: StepPriority | null | undefined; onChange: (p: StepPriority | null) => void; name?: string }) {
  const q = value ? QUADRANTS[value] : null;
  return (
    <label className={'prio-pick' + (q ? ' set' : '')} style={q ? ({ '--pc': q.color } as CSSProperties) : undefined}
      data-tip={q ? `${q.label}: ${q.hint.toLowerCase()}. Tap to change the priority.` : 'Give this step a priority: Urgent, Important, Not urgent or Not important (the same colours as the Priorities page).'}>
      <span className="pp-dot" aria-hidden="true" />
      <span className="pp-text">{q ? q.label : 'Priority'}</span>
      <select value={value ?? ''} aria-label={`Priority${name ? ` of ${name}` : ''}`} onChange={(e) => onChange((e.target.value || null) as StepPriority | null)}>
        <option value="">No priority</option>
        {QUADRANT_ORDER.map((k) => <option key={k} value={k}>{QUADRANTS[k].label}: {QUADRANTS[k].hint}</option>)}
      </select>
    </label>
  );
}

/** A coloured dot, for lists where the chip would be too big. */
export function PrioDot({ value }: { value: StepPriority | null | undefined }) {
  if (!value) return null;
  const q = QUADRANTS[value];
  return <span className="pp-mini" style={{ background: q.color }} data-tip={`Priority: ${q.label}`} aria-label={`Priority ${q.label}`} role="img" />;
}

/** A contributor's initials in their colour. */
export function Avatar({ m, size = 26 }: { m: Member | null | undefined; size?: number }) {
  if (!m) return <span className="avatar none" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden="true">?</span>;
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4, background: `var(--m${m.color % 8})` }} aria-hidden="true">
      {initials(m.name)}
    </span>
  );
}

/** Pick who a piece of work is for. */
export function MemberSelect({ members, value, onChange, label = 'Assigned to' }: { members: Member[]; value: string | null | undefined; onChange: (id: string | null) => void; label?: string }) {
  const m = members.find((x) => x.id === value) ?? null;
  return (
    <label className="member-pick" data-tip="Who is doing this piece of work. Their progress bar on the People list counts it.">
      <Avatar m={m} size={22} />
      <span>{m ? m.name : 'Not assigned'}</span>
      <select value={m ? m.id : ''} aria-label={label} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Not assigned</option>
        {members.map((x) => <option key={x.id} value={x.id}>{x.name}{x.role ? ` · ${x.role}` : ''}</option>)}
      </select>
    </label>
  );
}
