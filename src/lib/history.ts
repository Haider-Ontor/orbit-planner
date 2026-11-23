import type { Task, Project, Routine, Goal } from './types';
import { toISODate } from './dates';
import { saveWithUndo } from './undo';
import { toggleStep, toggleRoutineDay } from './models';

/* Everything that has been finished, with when — the "Done" log.
 * Built from the records themselves (doneAt / routine log), so nothing extra
 * has to be stored and it syncs like everything else. */

export type DoneKind = 'task' | 'step' | 'routine' | 'goal';
export interface DoneItem {
  key: string;
  kind: DoneKind;
  at: number | null;   // exact time if known (routines only know the day)
  day: string;         // YYYY-MM-DD
  title: string;
  context: string;     // project / parent / category
  reopen: () => Promise<unknown>;
  taskRef?: Task;
}

export function completions(tasks: Task[], projects: Project[], routines: Routine[], goals: Goal[]): DoneItem[] {
  const out: DoneItem[] = [];
  const pname = new Map(projects.map((p) => [p.id, p.name]));

  for (const t of tasks) {
    if (t.status !== 'done' || !t.doneAt) continue;
    out.push({
      key: 't' + t.id, kind: 'task', at: t.doneAt, day: toISODate(new Date(t.doneAt)), title: t.title,
      context: t.projectId ? pname.get(t.projectId) ?? '' : '', taskRef: t,
      reopen: () => saveWithUndo('tasks', t, { ...t, status: 'todo', doneAt: null }, `Reopened: ${t.title}`),
    });
  }

  for (const p of projects) {
    for (const t of p.plan ?? []) {
      if (!t.subs.length) {
        if (t.done && t.doneAt) out.push({
          key: `s${p.id}${t.id}`, kind: 'step', at: t.doneAt, day: toISODate(new Date(t.doneAt)), title: t.name,
          context: p.name, reopen: () => toggleStep(p, t.id, null),
        });
        continue;
      }
      for (const s of t.subs) {
        if (s.done && s.doneAt) out.push({
          key: `s${p.id}${s.id}`, kind: 'step', at: s.doneAt, day: toISODate(new Date(s.doneAt)), title: s.name,
          context: t.name && t.name !== p.name ? `${p.name} · ${t.name}` : p.name, reopen: () => toggleStep(p, t.id, s.id),
        });
      }
    }
  }

  for (const r of routines) {
    for (const day of Object.keys(r.log)) {
      out.push({ key: `r${r.id}${day}`, kind: 'routine', at: null, day, title: r.title, context: r.category, reopen: () => toggleRoutineDay(r, day) });
    }
  }

  for (const g of goals) {
    if (g.status !== 'done' || !g.doneAt) continue;
    out.push({
      key: 'g' + g.id, kind: 'goal', at: g.doneAt, day: toISODate(new Date(g.doneAt)), title: g.title, context: '',
      reopen: () => saveWithUndo('goals', g, { ...g, status: 'active', doneAt: null }, `Goal reopened: ${g.title}`),
    });
  }

  return out.sort((a, b) => b.day.localeCompare(a.day) || (b.at ?? 0) - (a.at ?? 0));
}

export const KIND_LABEL: Record<DoneKind, string> = { task: 'To-do', step: 'Step', routine: 'Routine', goal: 'Goal' };
export const KIND_ICON: Record<DoneKind, string> = { task: '✓', step: '◆', routine: '↻', goal: '🎯' };
