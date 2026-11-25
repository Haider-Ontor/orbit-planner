import { db, uid, save, alive } from './db';
import { today, mondayOf, addDays, daysBetween, weekName, monthOf, monthEnd, monthStart, monthName, addMonths } from './dates';
import type { Task, Routine, Project, Note, Goal, PlanTask, PlanSub, MtoLevels, Member, StepPriority } from './types';
import type { ExtractedTask } from './ai';
import { saveWithUndo, doneMsg } from './undo';
import { deadlineMs, deadlineText } from './deadline';

export function newTask(p: Partial<Task> = {}): Task {
  return {
    id: uid(), updated_at: Date.now(), deleted: 0,
    title: '', details: '', due: null, dueTime: null, start: null, durationMin: null,
    impact: 3, urgency: 2, status: 'todo', doneAt: null, projectId: null,
    requirements: [], links: [], tags: [], source: 'manual', gcalEventId: null, createdAt: Date.now(),
    ...p,
  };
}

export function newRoutine(p: Partial<Routine> = {}): Routine {
  return {
    id: uid(), updated_at: Date.now(), deleted: 0,
    title: '', freq: 'daily', days: [], every: 2, startDate: today(), time: null, log: {},
    category: 'General', archived: false, createdAt: Date.now(),
    ...p,
  };
}

export function newNote(p: Partial<Note> = {}): Note {
  return {
    id: uid(), updated_at: Date.now(), deleted: 0,
    title: '', body: '', kind: 'text', tags: [], projectId: null, organized: false, hasAudio: false, createdAt: Date.now(),
    ...p,
  };
}

/* ---------------- plans: task → sub-tasks with deadlines ---------------- */
export const newPlanTask = (p: Partial<PlanTask> = {}): PlanTask => ({ id: uid(), name: '', start: null, due: null, done: false, subs: [], ...p });
export const newPlanSub = (p: Partial<PlanSub> = {}): PlanSub => ({ id: uid(), name: '', due: null, done: false, ...p });

export function newProject(p: Partial<Project> = {}): Project {
  return {
    id: uid(), updated_at: Date.now(), deleted: 0,
    name: p.name || 'New project', kind: 'project', plan: [], color: 1, archived: false, createdAt: Date.now(),
    ...p,
  };
}

/** Old week-grid charts (v0.1–0.2) → task / sub-task plan with real dates. */
export function normalizeProject(p: Project): Project {
  if (Array.isArray(p.plan)) return p;
  const rows = p.rows ?? [];
  const step = p.unit === 'day' ? 1 : 7;
  const base = p.startDate ?? mondayOf(today());
  const startOf = (n: number) => addDays(base, (n - 1) * step);
  const endOf = (n: number) => addDays(base, n * step - 1);
  const plan: PlanTask[] = [];
  let cur: PlanTask | null = null;
  for (const r of rows) {
    if (r.type === 'obj' || !cur) {
      cur = newPlanTask({ name: r.type === 'obj' ? r.name : 'Tasks', start: startOf(r.start), due: endOf(r.end), done: r.type === 'obj' && r.progress >= 100 });
      plan.push(cur);
      if (r.type === 'obj') continue;
    }
    cur.subs.push(newPlanSub({ name: r.name, due: endOf(r.end), done: r.progress >= 100 }));
  }
  for (const t of plan) if (t.subs.length) t.done = t.subs.every((s) => s.done);
  return { ...p, plan };
}

function units(t: PlanTask): [done: number, total: number] {
  if (!t.subs.length) return [t.done ? 1 : 0, 1];
  return [t.done ? t.subs.length : t.subs.filter((s) => s.done).length, t.subs.length];
}
/** Like units(), but a task without sub-tasks counts its hand-set progress (40% = 0.4 done). */
function progressUnits(t: PlanTask): [done: number, total: number] {
  if (!t.subs.length && !t.done) return [Math.max(0, Math.min(100, t.progress ?? 0)) / 100, 1];
  return units(t);
}
export function taskProgress(t: PlanTask): number {
  const [d, n] = progressUnits(t);
  return Math.round((d / n) * 100);
}
export function projectProgress(p: Project): number {
  let d = 0, n = 0;
  for (const t of p.plan ?? []) { const [a, b] = progressUnits(t); d += a; n += b; }
  return n ? Math.round((d / n) * 100) : 0;
}
export function stepCounts(p: Project) {
  let d = 0, n = 0;
  for (const t of p.plan ?? []) { const [a, b] = units(t); d += a; n += b; }
  return { done: d, total: n };
}

export interface Deadline {
  projectId: string; projectName: string; kind: Project['kind']; taskId: string; subId: string | null;
  name: string; parent: string | null; due: string; dueTime: string | null; at: number;
  priority: StepPriority | null; who: string | null; // group work: who it's assigned to
}
const PRIO_RANK: Record<StepPriority, number> = { first: 0, second: 1, third: 2, eliminate: 3 };
export const prioRank = (p: StepPriority | null | undefined) => (p ? PRIO_RANK[p] : 4);

/** Every unfinished task / sub-task that has a deadline, earliest first
 *  (a deadline without a time counts as the end of its day). */
export function deadlinesOf(projects: Project[]): Deadline[] {
  const out: Deadline[] = [];
  for (const p of projects) {
    if (p.archived) continue;
    for (const t of p.plan ?? []) {
      if (t.done) continue;
      const who = t.assignee ? p.members?.find((m) => m.id === t.assignee)?.name ?? null : null;
      const base = { projectId: p.id, projectName: p.name, kind: p.kind, taskId: t.id, who };
      for (const s of t.subs) if (!s.done && s.due) out.push({ ...base, subId: s.id, name: s.name, parent: t.name, due: s.due, dueTime: s.dueTime ?? null, at: deadlineMs(s.due, s.dueTime)!, priority: s.priority ?? t.priority ?? null });
      // the task's own deadline, unless an open sub-task already shows the same moment
      const tAt = deadlineMs(t.due, t.dueTime);
      if (t.due && tAt !== null && !t.subs.some((s) => !s.done && s.due && deadlineMs(s.due, s.dueTime) === tAt)) {
        out.push({ ...base, subId: null, name: t.name, parent: null, due: t.due, dueTime: t.dueTime ?? null, at: tAt, priority: t.priority ?? null });
      }
    }
  }
  return out.sort((a, b) => a.at - b.at || prioRank(a.priority) - prioRank(b.priority));
}

/* ---------------- group work ---------------- */
export const newMember = (p: Partial<Member> = {}): Member => ({ id: uid(), name: '', role: '', color: 0, ...p });
export const MEMBER_COLORS = 8;
/** "Rahim Uddin" → "RU", "Ana" → "AN". */
export const initials = (name: string) => {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return ((w.length > 1 ? w[0][0] + w[w.length - 1][0] : (w[0] ?? '?').slice(0, 2)) || '?').toUpperCase();
};

export interface MemberStats {
  member: Member | null;  // null = work nobody has been given yet
  tasks: PlanTask[];
  done: number;           // finished pieces of work
  total: number;
  progress: number;       // 0..100, average over their work
  overdue: number;
  next: { name: string; due: string; dueTime: string | null } | null;
}
/** How each person in a group is doing: their work, progress, what's late, what's next. */
export function memberStats(p: Project): MemberStats[] {
  const now = Date.now();
  const end = (t: PlanTask) => (t.due ? deadlineMs(t.due, t.dueTime) : null);
  const of = (member: Member | null): MemberStats => {
    const tasks = (p.plan ?? []).filter((t) => (member ? t.assignee === member.id : !t.assignee || !p.members?.some((m) => m.id === t.assignee)));
    const open = tasks.filter((t) => !t.done && t.due).sort((a, b) => (end(a) ?? 0) - (end(b) ?? 0));
    const nextT = open.find((t) => (end(t) ?? 0) >= now) ?? null;
    return {
      member, tasks,
      done: tasks.filter((t) => t.done).length,
      total: tasks.length,
      progress: tasks.length ? Math.round(tasks.reduce((a, t) => a + taskProgress(t), 0) / tasks.length) : 0,
      overdue: open.filter((t) => (end(t) ?? Infinity) < now).length,
      next: nextT ? { name: nextT.name, due: nextT.due!, dueTime: nextT.dueTime ?? null } : null,
    };
  };
  const rows = (p.members ?? []).map(of);
  const nobody = of(null);
  return nobody.total ? [...rows, nobody] : rows;
}

/** A new group with you in it, plus the people you name. */
export function newGroup(name: string, people: string[]): Project {
  const members = [newMember({ name: 'You', color: 0 }), ...people.map((n, i) => newMember({ name: n, color: (i + 1) % MEMBER_COLORS }))];
  return newProject({ name, kind: 'group', color: 3, members });
}

/** Tick a task or sub-task done from outside the plan editor. */
export async function toggleStep(p: Project, taskId: string, subId: string | null) {
  const now = Date.now();
  let label = '', done = false;
  const plan = p.plan.map((t) => {
    if (t.id !== taskId) return t;
    if (!subId) {
      done = !t.done; label = t.name;
      return { ...t, done, doneAt: done ? now : null, subs: done ? t.subs.map((s) => (s.done ? s : { ...s, done: true, doneAt: now })) : t.subs };
    }
    const subs = t.subs.map((s) => {
      if (s.id !== subId) return s;
      done = !s.done; label = s.name;
      return { ...s, done, doneAt: done ? now : null };
    });
    const all = subs.length > 0 && subs.every((s) => s.done);
    return { ...t, subs, done: all, doneAt: all ? (t.doneAt ?? now) : null };
  });
  await saveWithUndo('projects', p, { ...p, plan }, doneMsg(label, done));
}

/** Tick / untick a routine for one day, with Undo. */
export function toggleRoutineDay(r: Routine, day: string) {
  const log = { ...r.log };
  const done = !log[day];
  if (done) log[day] = 1; else delete log[day];
  return saveWithUndo('routines', r, { ...r, log }, doneMsg(r.title, done));
}

/* ---------------- weekly goals ---------------- */
export function newGoal(p: Partial<Goal> = {}): Goal {
  const wk = p.weekStart ?? mondayOf(today());
  return {
    id: uid(), updated_at: Date.now(), deleted: 0,
    title: '', details: '', weekStart: wk, firstWeek: wk, status: 'active',
    projectId: null, progress: 0, doneAt: null, createdAt: Date.now(),
    ...p,
  };
}

export function goalProgress(g: Goal, projects: Map<string, Project>): number {
  if (g.status === 'done') return 100;
  if (g.mto && (g.framework === 'mto' || g.framework === 'both') && g.mto.target) {
    return Math.max(0, Math.min(100, Math.round((g.mto.current / g.mto.target) * 100)));
  }
  const p = g.projectId ? projects.get(g.projectId) : undefined;
  return p && p.plan.length ? projectProgress(p) : g.progress;
}

/** Which MTO level the current value has reached. */
export function mtoLevel(m: MtoLevels): 'none' | 'min' | 'target' | 'outrageous' {
  if (m.outrageous != null && m.current >= m.outrageous) return 'outrageous';
  if (m.target != null && m.current >= m.target) return 'target';
  if (m.min != null && m.current >= m.min) return 'min';
  return 'none';
}

/** Number of weeks the goal spans (1 = a single week). */
export const goalWeeks = (g: Goal) => Math.max(1, Math.round(daysBetween(g.firstWeek, g.weekStart) / 7) + 1);
/** How many weeks it has been pushed later than planned. Goals from before
 *  v0.5 had no planned span, so their whole span counts as pushes. */
export const weeksCarried = (g: Goal) => g.pushes ?? (g.framework ? 0 : goalWeeks(g) - 1);
/** Is the goal open in this week? (start week ≤ week ≤ due week) */
export const goalCoversWeek = (g: Goal, monday: string) => g.firstWeek <= monday && monday <= g.weekStart;

/** Earliest week the due week may be moved back to: this week, never the past. */
export const earliestDueWeek = () => mondayOf(today());

/** Move the goal's due week.
 *  - Started goals: only the finish moves; the goal stays open in every week
 *    in between, and moving it later counts as a push.
 *  - Goals that haven't started: a one-week goal moves as a whole (just
 *    rescheduled); a longer one keeps its start and only the finish moves,
 *    unless the finish would land before the start.
 *  An exact deadline moves with it (same weekday and time); if that moment
 *  would already be over, the exact deadline is dropped and the week stays. */
export function movedGoal(g: Goal, newDue: string): Goal {
  const due = newDue < earliestDueWeek() ? earliestDueWeek() : newDue;
  const shift = daysBetween(g.weekStart, due);
  const notStarted = g.firstWeek > earliestDueWeek();
  let deadline = g.deadline ? addDays(g.deadline, shift) : null;
  let deadlineTime = g.deadlineTime ?? null;
  if (deadline && (deadlineMs(deadline, deadlineTime) ?? 0) < Date.now()) { deadline = null; deadlineTime = null; }
  if (!deadline) deadlineTime = null;
  const dueMode = deadline ? (g.dueMode === 'month' ? 'date' : g.dueMode) : 'week';
  const moved = { ...g, weekStart: due, deadline, deadlineTime, dueMode };
  if (notStarted) {
    if (goalWeeks(g) === 1 || due < g.firstWeek) {
      const startShift = daysBetween(g.firstWeek, due);
      return { ...moved, firstWeek: due, pushes: g.pushes ?? 0, startDate: g.startDate ? addDays(g.startDate, startShift) : g.startDate };
    }
    return moved; // re-planned before it started: not a push
  }
  return { ...moved, firstWeek: g.firstWeek > due ? due : g.firstWeek, pushes: Math.max(0, weeksCarried(g) + Math.round(shift / 7)) };
}

/** Set (or clear) a goal's exact deadline. The due week follows the date. */
export function withDeadline(g: Goal, date: string | null, time: string | null): Goal {
  if (!date) return { ...g, deadline: null, deadlineTime: null, dueMode: 'week' };
  const wk = mondayOf(date);
  return { ...g, deadline: date, deadlineTime: time, dueMode: 'date', weekStart: wk, firstWeek: g.firstWeek > wk ? wk : g.firstWeek };
}

/** How the goal's finish is set: a week, a whole month, or an exact date. */
export const goalDueMode = (g: Goal): 'week' | 'month' | 'date' => (g.deadline ? (g.dueMode === 'month' ? 'month' : 'date') : 'week');

/** "end of December", "Fri 28 Nov · 5pm", "this week (24 – 30 Nov)". */
export function goalDueText(g: Goal): string {
  const m = goalDueMode(g);
  if (m === 'month') return `end of ${monthName(monthOf(g.deadline!))}`;
  if (m === 'date') return deadlineText(g.deadline!, g.deadlineTime);
  return weekName(g.weekStart).replace(/^This|^Next|^Week/, (x) => x.toLowerCase());
}
/** "this week", "1 Dec", "December" */
export function goalStartText(g: Goal): string {
  if (g.startDate && g.startMode === 'month') return monthName(monthOf(g.startDate));
  if (g.startDate && g.startMode === 'date') return deadlineText(g.startDate);
  return weekName(g.firstWeek).replace(/^This|^Next|^Week/, (x) => x.toLowerCase());
}

/** Due by the end of month `ym` (never a month that is already over). */
export function goalInMonth(g: Goal, ym: string): Goal {
  const cur = monthOf(today());
  const target = ym < cur ? cur : ym;
  const end = monthEnd(target);
  const wk = mondayOf(end);
  const was = g.deadline && goalDueMode(g) === 'month' ? monthOf(g.deadline) : monthOf(addDays(g.weekStart, 6));
  const shift = (Number(target.slice(0, 4)) - Number(was.slice(0, 4))) * 12 + Number(target.slice(5)) - Number(was.slice(5));
  const notStarted = g.firstWeek > earliestDueWeek();
  const base = { ...g, deadline: end, deadlineTime: null, dueMode: 'month' as const, weekStart: wk };
  if (notStarted) {
    const startMonth = g.startDate ? monthOf(g.startDate) : monthOf(addDays(g.firstWeek, 6));
    if (startMonth === was || target < startMonth) {
      // a one-month goal that hasn't started (or a finish before the start): move it as a whole
      let startDate: string | null = monthStart(addMonths(startMonth, shift));
      if (monthOf(startDate) < cur) startDate = monthStart(cur);
      if (!g.startDate && g.startMode !== 'month') startDate = null;
      const fw = mondayOf(startDate ?? monthStart(target));
      return { ...base, startDate, startMode: startDate ? 'month' : g.startMode, firstWeek: fw < earliestDueWeek() ? earliestDueWeek() : fw > wk ? wk : fw };
    }
    return base; // re-planned before it started: the start stays, not a push
  }
  return { ...base, firstWeek: g.firstWeek > wk ? wk : g.firstWeek, pushes: Math.max(0, weeksCarried(g) + shift) };
}

/** Is the goal late? Exact deadline if it has one, otherwise its due week. */
export const goalLate = (g: Goal) => g.status === 'active' && (g.deadline
  ? (deadlineMs(g.deadline, g.deadlineTime) ?? Infinity) < Date.now()
  : g.weekStart < mondayOf(today()));

/** Can the due week (or month) move one step earlier? Never into the past. */
export const goalCanMoveEarlier = (g: Goal) => {
  if (g.status !== 'active') return false;
  if (goalDueMode(g) === 'month') return monthOf(g.deadline!) > monthOf(today());
  return g.weekStart > earliestDueWeek() && (!g.deadline || (deadlineMs(addDays(g.deadline, -7), g.deadlineTime) ?? 0) > Date.now());
};

/** The step list behind a goal (stored as a project of kind "goal"). */
export function goalPlan(g: Goal, plan: PlanTask[] = []): Project {
  return newProject({ name: g.title, kind: 'goal', color: 2, plan });
}

/** AI plan → plan tasks, with dates clamped into [start, end]. */
export function planFromAI(tasks: { name: string; start_date: string | null; due_date: string | null; subtasks: { name: string; due_date: string | null }[] }[], start: string, end: string): PlanTask[] {
  const ok = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? (d < start ? start : d > end ? end : d) : null);
  return tasks.map((t) => newPlanTask({
    name: t.name, start: ok(t.start_date), due: ok(t.due_date),
    subs: t.subtasks.map((s) => newPlanSub({ name: s.name, due: ok(s.due_date) })),
  }));
}

/** Sunday of the goal's week: the default "finish by" date. */
export const weekEnd = (monday: string) => addDays(monday, 6);

/* ---------------- AI extraction → tasks / routines ---------------- */
export async function saveExtracted(items: ExtractedTask[], projectsByName: Map<string, string>, source: 'ai' | 'voice') {
  let n = 0;
  for (const x of items) {
    if (x.repeat) {
      const r = newRoutine({ title: x.title, time: x.due_time ?? (x.start_datetime ? x.start_datetime.slice(11, 16) : null) });
      const rep = x.repeat.toLowerCase();
      if (rep.startsWith('weekdays')) r.freq = 'weekdays';
      else if (rep.startsWith('weekly')) {
        r.freq = 'weekly';
        const names = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        r.days = (rep.split(':')[1] || '').split(',').map((s) => names.indexOf(s.trim().slice(0, 3))).filter((i) => i >= 0);
        if (!r.days.length) r.days = [new Date().getDay()];
      } else if (rep.startsWith('every')) { r.freq = 'interval'; r.every = Math.max(1, parseInt(rep.split(':')[1]) || 2); }
      await save('routines', r);
    } else {
      const pid = x.project_hint ? projectsByName.get(x.project_hint.toLowerCase()) ?? null : null;
      await save('tasks', newTask({
        title: x.title, details: x.details,
        due: x.due_date ?? (x.start_datetime ? x.start_datetime.slice(0, 10) : null),
        dueTime: x.due_time,
        start: x.start_datetime,
        durationMin: x.duration_minutes,
        impact: clamp(x.impact), urgency: clamp(x.urgency),
        requirements: x.requirements.map((text) => ({ id: uid(), text, done: false })),
        links: x.links, projectId: pid, source,
      }));
    }
    n++;
  }
  return n;
}
const clamp = (n: number) => Math.max(1, Math.min(5, Math.round(n || 3)));

/* ---------------- one-time cleanup of the old sample content ---------------- */
// v0.1–0.2 put example content into new installs. Orbit now starts empty;
// this removes those examples from devices that already have them. Titles are
// matched by an FNV-1a hash so the old example text is not kept in the code.
const fnv = (s: string) => { let x = 0x811c9dc5; for (const c of s) { x ^= c.codePointAt(0)!; x = Math.imul(x, 0x01000193) >>> 0; } return x.toString(36); };
const SAMPLE_PROJECTS = ['7l6nxh', 'rglf01', '9z95x9'];
const SAMPLE_TASKS = ['x2mgth', '1sxiy35', '1mxl3hu'];
const SAMPLE_GOALS = ['9z95x9'];
const SAMPLE_ROUTINES = ['123gh84', '12ift7z', 'ccf9ve']; // title|category|time

export async function removeOldSamples() {
  if (localStorage.getItem('orbit.samplesRemoved')) return;
  for (const p of alive(await db.projects.toArray())) if (SAMPLE_PROJECTS.includes(fnv(p.name))) await save('projects', { ...p, deleted: 1 });
  for (const t of alive(await db.tasks.toArray())) if (SAMPLE_TASKS.includes(fnv(t.title))) await save('tasks', { ...t, deleted: 1 });
  for (const g of alive(await db.goals.toArray())) if (SAMPLE_GOALS.includes(fnv(g.title))) await save('goals', { ...g, deleted: 1 });
  for (const r of alive(await db.routines.toArray())) {
    if (SAMPLE_ROUTINES.includes(fnv(`${r.title}|${r.category}|${r.time ?? ''}`))) await save('routines', { ...r, deleted: 1 });
  }
  localStorage.setItem('orbit.samplesRemoved', '1');
  localStorage.removeItem('orbit.seeded');
  localStorage.removeItem('orbit.seededGoal');
}
