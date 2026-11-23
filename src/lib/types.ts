// Every synced record carries these fields. `dirty` is local-only (1 = needs push).
export interface Base {
  id: string;
  updated_at: number; // ms epoch, last-write-wins
  deleted: 0 | 1;
  dirty?: 0 | 1;
}

export interface Requirement { id: string; text: string; done: boolean }

export type TaskStatus = 'todo' | 'doing' | 'done';

export interface Task extends Base {
  title: string;
  details: string;
  due: string | null;       // YYYY-MM-DD
  dueTime: string | null;   // HH:MM
  start: string | null;     // ISO datetime, if it is a scheduled block / event
  durationMin: number | null;
  impact: number;           // 1..5  (vertical axis: impact / potential reward)
  urgency: number;          // 1..5  (horizontal axis: importance / urgency)
  status: TaskStatus;
  doneAt: number | null;
  projectId: string | null;
  requirements: Requirement[];
  links: string[];
  tags: string[];
  source: 'manual' | 'ai' | 'voice';
  gcalEventId: string | null;
  createdAt: number;
}

export type RoutineFreq = 'daily' | 'weekdays' | 'weekly' | 'interval';
export interface Routine extends Base {
  title: string;
  freq: RoutineFreq;
  days: number[];       // for weekly: 0=Sun..6=Sat
  every: number;        // for interval: every N days
  startDate: string;    // YYYY-MM-DD
  time: string | null;  // HH:MM reminder
  log: Record<string, 1>; // completed dates
  category: string;     // e.g. Study, Health
  archived: boolean;
  createdAt: number;
}

/** A plan is a list of tasks; each task has optional sub-tasks with deadlines. */
export interface PlanSub {
  id: string;
  name: string;
  due: string | null;   // YYYY-MM-DD
  done: boolean;
  doneAt?: number | null; // when it was ticked (for the history log)
}
export interface PlanTask {
  id: string;
  name: string;
  start: string | null; // YYYY-MM-DD
  due: string | null;   // YYYY-MM-DD
  done: boolean;
  doneAt?: number | null;
  subs: PlanSub[];
}

/** Rows of the earlier week-grid chart (v0.1–0.2), converted to `plan` on load. */
export interface LegacyGanttRow {
  type: 'obj' | 'task' | 'sub';
  name: string;
  start: number;
  end: number;
  group: number;
  progress: number;
}

export interface Project extends Base {
  name: string;
  kind: 'project' | 'learning' | 'goal';
  plan: PlanTask[];
  color: number;
  archived: boolean;
  createdAt: number;
  // legacy chart fields, kept only so old records can be converted
  rows?: LegacyGanttRow[];
  startDate?: string;
  weeks?: number;
  unit?: 'week' | 'day';
}

export interface Note extends Base {
  title: string;
  body: string;
  kind: 'text' | 'voice';
  tags: string[];
  projectId: string | null;
  organized: boolean;  // AI has turned it into tasks
  hasAudio: boolean;   // audio blob lives only on the recording device
  createdAt: number;
}

export interface CalEvent extends Base {
  summary: string;
  start: string;   // ISO datetime or YYYY-MM-DD
  end: string;
  allDay: boolean;
  location: string;
  htmlLink: string;
  fromOrbit: boolean; // created by Orbit from a task
}

/** A goal set for one week ("This week I will…"). Progress comes from its
 *  list of steps when it has one, otherwise from the manual slider.
 *  An unfinished goal stays open and can be carried into later weeks. */
export interface SmartCriteria { specific: string; measurable: string; achievable: string; relevant: string }
export interface MtoLevels { measure: string; min: number | null; target: number | null; outrageous: number | null; current: number }

export interface Goal extends Base {
  title: string;
  details: string;
  /** A goal spans from `firstWeek` to `weekStart` (its due week). Pushing it
   *  later extends the span; it stays open in every week in between. */
  weekStart: string;          // Monday of the due week
  firstWeek: string;          // Monday of the week it starts
  priority?: 'high' | 'normal';
  pushes?: number;            // times the due week was pushed later (not the planned span)
  framework?: 'smart' | 'mto' | 'both' | 'none';
  smart?: SmartCriteria;
  mto?: MtoLevels;
  status: 'active' | 'done' | 'dropped';
  projectId: string | null;   // its steps (a project of kind "goal")
  progress: number;           // 0..100, used when there are no steps
  doneAt: number | null;
  createdAt: number;
}

export type SyncKind = 'tasks' | 'routines' | 'projects' | 'notes' | 'events' | 'goals';
export const SYNC_TABLES: SyncKind[] = ['tasks', 'routines', 'projects', 'notes', 'events', 'goals'];
