import type { Task } from './types';
import { today, daysBetween } from './dates';

/** Quadrants from the prioritization matrix:
 *  y = Impact / potential reward, x = Importance / urgency. */
export type Quadrant = 'first' | 'second' | 'third' | 'eliminate';

export const QUADRANTS: Record<Quadrant, { label: string; hint: string; color: string; ink: string }> = {
  first:     { label: 'First Priority',  hint: 'High impact · Critical',  color: '#e8004f', ink: '#ffffff' },
  second:    { label: 'Second Priority', hint: 'High impact · Neutral',   color: '#f6c700', ink: '#2a2a2a' },
  third:     { label: 'Third Priority',  hint: 'Low impact · Critical',   color: '#12c4f0', ink: '#0b2530' },
  eliminate: { label: 'Eliminate',       hint: 'Low impact · Neutral',    color: '#283441', ink: '#ffffff' },
};

/** Days until due (negative = overdue), or null. */
export function daysLeft(t: Task): number | null {
  return t.due ? daysBetween(today(), t.due) : null;
}

/** Urgency rises on its own as the deadline approaches. */
export function effectiveUrgency(t: Task): number {
  const d = daysLeft(t);
  let u = t.urgency;
  if (d !== null) {
    if (d <= 0) u = Math.max(u, 5);
    else if (d <= 2) u = Math.max(u, 4);
    else if (d <= 7) u = Math.max(u, 3);
  }
  return u;
}

export function quadrantOf(t: Task): Quadrant {
  const high = t.impact >= 3;
  const crit = effectiveUrgency(t) >= 3;
  if (high && crit) return 'first';
  if (high) return 'second';
  if (crit) return 'third';
  return 'eliminate';
}

/** Values written when a task is dropped onto a quadrant. */
export function quadrantValues(q: Quadrant): { impact: number; urgency: number } {
  switch (q) {
    case 'first': return { impact: 4, urgency: 4 };
    case 'second': return { impact: 4, urgency: 2 };
    case 'third': return { impact: 2, urgency: 4 };
    default: return { impact: 2, urgency: 2 };
  }
}

/** Single number used to rank "what should I do now". Higher = sooner. */
export function score(t: Task): number {
  if (t.status === 'done') return -1;
  const d = daysLeft(t);
  let deadline = 0;
  if (d !== null) {
    if (d < 0) deadline = 8 + Math.min(4, -d);
    else if (d === 0) deadline = 7;
    else if (d === 1) deadline = 5;
    else if (d <= 3) deadline = 3;
    else if (d <= 7) deadline = 1.5;
  }
  const pendingReq = t.requirements.filter((r) => !r.done).length;
  return t.impact * 2.2 + effectiveUrgency(t) * 1.8 + deadline + (t.status === 'doing' ? 1.5 : 0) + Math.min(pendingReq, 3) * 0.3;
}

export function dueLabel(t: Task): { text: string; tone: 'over' | 'soon' | 'ok' | '' } {
  const d = daysLeft(t);
  if (d === null) return { text: '', tone: '' };
  if (d < 0) return { text: `${-d}d overdue`, tone: 'over' };
  if (d === 0) return { text: 'Due today', tone: 'over' };
  if (d === 1) return { text: 'Due tomorrow', tone: 'soon' };
  if (d <= 3) return { text: `Due in ${d}d`, tone: 'soon' };
  return { text: `Due in ${d}d`, tone: 'ok' };
}
