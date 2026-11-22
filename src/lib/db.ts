import Dexie, { type Table } from 'dexie';
import type { Task, Routine, Project, Note, CalEvent, Goal, SyncKind, Base } from './types';

export interface AudioBlob { id: string; blob: Blob; mime: string }

class OrbitDB extends Dexie {
  tasks!: Table<Task, string>;
  routines!: Table<Routine, string>;
  projects!: Table<Project, string>;
  notes!: Table<Note, string>;
  events!: Table<CalEvent, string>;
  goals!: Table<Goal, string>;
  audio!: Table<AudioBlob, string>;

  constructor() {
    super('orbit');
    this.version(1).stores({
      tasks: 'id, updated_at, dirty, deleted, due, status, projectId',
      routines: 'id, updated_at, dirty, deleted',
      projects: 'id, updated_at, dirty, deleted',
      notes: 'id, updated_at, dirty, deleted, projectId',
      events: 'id, updated_at, dirty, deleted, start',
      audio: 'id',
    });
    this.version(2).stores({
      goals: 'id, updated_at, dirty, deleted, weekStart, status',
    });
  }
}

export const db = new OrbitDB();

export const uid = () => crypto.randomUUID();

type Listener = () => void;
const changeListeners = new Set<Listener>();
export function onLocalChange(fn: Listener) { changeListeners.add(fn); return () => changeListeners.delete(fn); }
function emit() { changeListeners.forEach((f) => f()); }

/** Save a record locally and mark it for sync. */
export async function save<T extends Base>(kind: SyncKind, rec: T): Promise<T> {
  const next = { ...rec, updated_at: Date.now(), dirty: 1 as const };
  await (db[kind] as unknown as Table<T, string>).put(next);
  emit();
  return next;
}

export async function patch<T extends Base>(kind: SyncKind, id: string, changes: Partial<T>) {
  const table = db[kind] as unknown as Table<T, string>;
  const cur = await table.get(id);
  if (!cur) return;
  return save(kind, { ...cur, ...changes });
}

/** Soft delete so the deletion syncs to other devices. */
export async function remove(kind: SyncKind, id: string) {
  const table = db[kind] as unknown as Table<Base, string>;
  const cur = await table.get(id);
  if (!cur) return;
  await save(kind, { ...cur, deleted: 1 });
  if (kind === 'notes') await db.audio.delete(id);
}

export const alive = <T extends Base>(rows: T[]) => rows.filter((r) => !r.deleted);
